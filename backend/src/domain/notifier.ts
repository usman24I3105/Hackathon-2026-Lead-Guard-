import { workerPool } from '../db/pool';
import logger from '../http/logger';
import { randomUUID } from 'crypto';

interface NotificationInput {
  userId: string;
  leadId: string;
  workspaceId: string;
  reason: string;
}

const RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s

/**
 * BE-10: Queue a Telegram notification with 3 retries.
 * Never awaited inside an escalation transaction — call and .catch().
 */
export async function enqueueNotification(input: NotificationInput): Promise<void> {
  const notificationId = `notif_${randomUUID().slice(0, 12)}`;
  try {
    await workerPool.query(
      `INSERT INTO notification (id, workspace_id, user_id, lead_id, type, payload)
       VALUES ($1, $2, $3, $4, 'telegram.escalation', $5)`,
      [notificationId, input.workspaceId, input.userId, input.leadId, JSON.stringify(input)],
    );
    processNotification(notificationId, input, 0);
  } catch (err) {
    logger.error({ err }, 'Failed to enqueue notification');
  }
}

async function processNotification(
  notificationId: string,
  input: NotificationInput,
  attempt: number,
): Promise<void> {
  const delay = RETRY_DELAYS[attempt];
  if (delay !== undefined) {
    await new Promise((r) => setTimeout(r, delay));
  }

  try {
    // Get user's Telegram chat id and bot token for this workspace
    const { rows: userRows } = await workerPool.query<{ telegram_chat_id: string | null }>(
      `SELECT telegram_chat_id FROM "user" WHERE id = $1`,
      [input.userId],
    );
    const chatId = userRows[0]?.telegram_chat_id;
    if (!chatId) {
      await markNotificationDone(notificationId, null, 'User has no Telegram chat id');
      return;
    }

    const { config } = await import('../config');
    const botToken = config.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      await markNotificationDone(notificationId, null, 'Telegram not configured');
      return;
    }

    const { PUBLIC_BASE_URL } = config;
    const leadUrl = `${PUBLIC_BASE_URL}/leads/${input.leadId}`;
    // SEC-5: escape HTML special chars; cap length
    const safeReason = escapeHtml(input.reason.slice(0, 200));
    const text = `🚨 Lead escalated\\n\\nReason: ${safeReason}\\nView: ${leadUrl}`;

    await workerPool.query(
      `UPDATE notification SET attempts = attempts + 1, last_attempted_at = NOW()
       WHERE id = $1`,
      [notificationId],
    );

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );

    // Log to integration_event
    await workerPool.query(
      `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
       VALUES ($1, 'telegram', $2, 'notification', $3)`,
      [input.workspaceId, notificationId, res.ok ? 'ok' : 'error'],
    );

    if (res.ok) {
      await markNotificationDone(notificationId, null, null);
      await workerPool.query(
        `UPDATE integration_config SET last_ok_at = NOW()
         WHERE workspace_id = $1 AND provider = 'telegram'`,
        [input.workspaceId],
      );
    } else {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`Telegram API error: ${errText}`);
    }
  } catch (err) {
    logger.warn({ err, attempt, notificationId }, 'Telegram notification attempt failed');
    if (attempt < RETRY_DELAYS.length - 1) {
      processNotification(notificationId, input, attempt + 1);
    } else {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      await markNotificationDone(notificationId, errMsg, null);
      await workerPool.query(
        `UPDATE integration_config SET last_error = $1
         WHERE workspace_id = $2 AND provider = 'telegram'`,
        [errMsg, input.workspaceId],
      );
    }
  }
}

async function markNotificationDone(
  notificationId: string,
  error: string | null,
  skipReason: string | null,
): Promise<void> {
  const finalError = error ?? skipReason;
  const sentAt = finalError ? null : new Date();
  await workerPool.query(
    `UPDATE notification
     SET sent_at = $1,
         error = $2
     WHERE id = $3`,
    [sentAt, finalError, notificationId],
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\x00-\x1f]/g, ''); // strip control chars
}
