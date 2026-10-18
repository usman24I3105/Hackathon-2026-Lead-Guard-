import { config } from '../config';
import logger from '../http/logger';
import { recordSyncEvent } from './sync-history';

export interface SlackAlertOptions {
  text?: string;
  title?: string;
  leadName?: string;
  leadPhone?: string;
  reason?: string;
  channel?: string;
  source?: string;
  leadId?: string;
  amount?: string | number;
  workspaceId?: string;
}

export async function sendSlackAlert(payload: string | SlackAlertOptions): Promise<boolean> {
  const webhookUrl = config.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('SLACK_WEBHOOK_URL not configured');
    return false;
  }

  let body: any;
  let textSummary = '';

  if (typeof payload === 'string') {
    textSummary = payload;
    body = { text: payload };
  } else {
    textSummary = payload.text || payload.title || payload.reason || 'LeadGuard Alert';

    const fields: any[] = [];
    if (payload.leadName) fields.push({ type: 'mrkdwn', text: `*Lead:* ${payload.leadName}` });
    if (payload.leadPhone) fields.push({ type: 'mrkdwn', text: `*Phone:* ${payload.leadPhone}` });
    if (payload.source) fields.push({ type: 'mrkdwn', text: `*Source:* ${payload.source}` });
    if (payload.reason) fields.push({ type: 'mrkdwn', text: `*Reason:* ${payload.reason}` });
    if (payload.amount !== undefined) fields.push({ type: 'mrkdwn', text: `*Amount:* $${payload.amount}` });

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: payload.title || '🚨 Lead Alert',
          emoji: true,
        },
      },
    ];

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields,
      });
    }

    if (payload.leadId) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Lead in CRM', emoji: true },
            url: `${config.PUBLIC_BASE_URL}/leads/${payload.leadId}`,
            style: 'primary',
          },
        ],
      });
    }

    body = {
      text: textSummary,
      blocks,
    };
  }

  // Attempt send with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await recordSyncEvent({
          direction: 'outbound',
          provider: 'slack',
          eventType: 'alert',
          status: 'ok',
          referenceId: typeof payload === 'object' ? payload.leadId : undefined,
          details: { summary: textSummary },
        });
        return true;
      }
      logger.warn({ status: res.status }, `Slack webhook returned ${res.status}, attempt ${attempt + 1}`);
    } catch (err: any) {
      logger.warn({ err: err.message }, `Slack webhook dispatch error, attempt ${attempt + 1}`);
    }
    // Delay before retry
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }

  await recordSyncEvent({
    direction: 'outbound',
    provider: 'slack',
    eventType: 'alert',
    status: 'failed',
    referenceId: typeof payload === 'object' ? payload.leadId : undefined,
    details: { summary: textSummary, error: 'Failed after 3 attempts' },
  });

  return false;
}
