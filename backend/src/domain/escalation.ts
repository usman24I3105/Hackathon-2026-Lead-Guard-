import { workerPool } from '../db/pool';
import { hub } from '../realtime/hub';
import { enqueueNotification } from './notifier';
import logger from '../http/logger';

/**
 * BE-6: The escalation sweeper.
 * Runs every 1 second in the same process (setInterval).
 * Uses workerPool (BYPASSRLS) to scan overdue leads.
 * Each lead is wrapped in its own transaction + tenant context.
 * Uses CAS (version + state) to prevent double-escalation.
 */
export function startSweeper(): ReturnType<typeof setInterval> {
  // Immediate first run
  runSweep().catch((err) => logger.error({ err }, 'Sweeper error'));
  return setInterval(() => {
    runSweep().catch((err) => logger.error({ err }, 'Sweeper error'));
  }, 1000);
}

async function runSweep(): Promise<void> {
  // Find all overdue waiting leads across all workspaces (worker pool bypasses RLS)
  const { rows: overdue } = await workerPool.query<{
    id: string;
    workspace_id: string;
    owner_id: string | null;
    version: number;
    escalation_level: number;
    escalation_count: number;
  }>(
    `SELECT id, workspace_id, owner_id, version, escalation_level, escalation_count
     FROM lead
     WHERE state = 'waiting'
       AND acknowledged_at IS NULL
       AND ack_deadline < NOW()
     LIMIT 50`,
  );

  for (const lead of overdue) {
    try {
      await escalateLead(lead);
    } catch (err) {
      logger.error({ err, leadId: lead.id }, 'Failed to escalate lead');
    }
  }
}

async function escalateLead(lead: {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  version: number;
  escalation_level: number;
  escalation_count: number;
}): Promise<void> {
  // Get workspace settings
  const { rows: wsRows } = await workerPool.query<{
    settings: {
      ackWindowsSeconds?: { L1: number; L2: number; L3: number };
      managerUserId?: string;
      backupUserId?: string;
    };
  }>(
    `SELECT settings FROM workspace WHERE id = $1`,
    [lead.workspace_id],
  );
  const ws = wsRows[0];
  const ackWindows = ws?.settings?.ackWindowsSeconds ?? { L1: 10, L2: 20, L3: 30 };
  const managerUserId = ws?.settings?.managerUserId ?? null;

  const nextLevel = lead.escalation_level + 1;

  // Determine next owner using chain: L1→next eligible, L2→backupUser, L3→manager
  let nextOwnerId: string | null = null;
  let shouldRecover = false;
  let recoveryReason = '';

  if (nextLevel === 1) {
    // Find next eligible by rotation (not current owner)
    const { rows } = await workerPool.query<{ id: string; open_leads: string; max_open_leads: number }>(
      `SELECT u.id, u.max_open_leads,
              (SELECT COUNT(*) FROM lead WHERE owner_id = u.id AND state = 'waiting') AS open_leads
       FROM "user" u
       WHERE u.workspace_id = $1
         AND u.status = 'available'
         AND u.in_rotation = true
         AND u.id != $2
       ORDER BY u.id LIMIT 10`,
      [lead.workspace_id, lead.owner_id ?? ''],
    );
    const eligible = rows.filter((u) => parseInt(u.open_leads) < u.max_open_leads);
    nextOwnerId = eligible[0]?.id ?? null;

    if (!nextOwnerId) {
      // Skip to backup/manager
      const { rows: ownerRows } = await workerPool.query<{ backup_user_id: string | null; manager_user_id: string | null }>(
        `SELECT backup_user_id, manager_user_id FROM "user" WHERE id = $1`,
        [lead.owner_id ?? ''],
      );
      nextOwnerId = ownerRows[0]?.backup_user_id ?? ownerRows[0]?.manager_user_id ?? managerUserId;
    }
  } else if (nextLevel === 2) {
    const { rows } = await workerPool.query<{ backup_user_id: string | null }>(
      `SELECT backup_user_id FROM "user" WHERE id = $1`,
      [lead.owner_id ?? ''],
    );
    nextOwnerId = rows[0]?.backup_user_id ?? managerUserId;
  } else if (nextLevel === 3) {
    nextOwnerId = managerUserId;
  } else {
    // Chain exhausted — stay with manager in recovery state
    shouldRecover = true;
    recoveryReason = 'Chain exhausted';
    nextOwnerId = managerUserId ?? lead.owner_id;
  }

  if (!nextOwnerId) {
    shouldRecover = true;
    recoveryReason = 'No available employee';
  }

  // Skip if next owner is same as current (move to next level)
  if (nextOwnerId === lead.owner_id && !shouldRecover) {
    shouldRecover = nextLevel > 3;
    recoveryReason = 'Chain exhausted';
  }

  const newAckDeadline = !shouldRecover && nextLevel <= 3
    ? new Date(Date.now() + (ackWindows[`L${nextLevel}` as 'L1' | 'L2' | 'L3'] ?? 30) * 1000)
    : null;

  // CAS UPDATE — the key to preventing double-escalation
  const client = await workerPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.workspace_id', lead.workspace_id]);

    const { rowCount } = await client.query(
      `UPDATE lead
       SET owner_id = $1,
           state = $2,
           escalation_level = $3,
           escalation_count = escalation_count + 1,
           ack_deadline = $4,
           recovery_reason = $5,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $6
         AND workspace_id = $7
         AND version = $8
         AND state = 'waiting'
         AND acknowledged_at IS NULL
       RETURNING id`,
      [
        nextOwnerId,
        shouldRecover ? 'recovery' : 'waiting',
        shouldRecover ? lead.escalation_level : nextLevel,
        newAckDeadline,
        shouldRecover ? recoveryReason : null,
        lead.id,
        lead.workspace_id,
        lead.version,
      ],
    );

    if (!rowCount || rowCount === 0) {
      // Lost the race — another process already escalated this lead
      await client.query('ROLLBACK');
      return;
    }

    // Write audit row
    await client.query(
      `INSERT INTO audit_log (id, workspace_id, type, entity_type, entity_id, actor, at, after)
       VALUES (gen_random_uuid()::text, $1, 'lead.escalated', 'lead', $2, 'system', NOW(), $3)`,
      [
        lead.workspace_id,
        lead.id,
        JSON.stringify({
          from: lead.owner_id,
          to: nextOwnerId,
          level: shouldRecover ? lead.escalation_level : nextLevel,
          state: shouldRecover ? 'recovery' : 'waiting',
          recoveryReason: shouldRecover ? recoveryReason : undefined,
        }),
      ],
    );

    await client.query('COMMIT');

    // Emit SSE after commit (ids-only per contract §3)
    hub.emit(lead.workspace_id, shouldRecover ? 'lead.recovery' : 'lead.escalated', {
      leadId: lead.id,
      ownerId: nextOwnerId,
      level: nextLevel,
    });

    // Queue Telegram notification
    if (nextOwnerId) {
      enqueueNotification({
        userId: nextOwnerId,
        leadId: lead.id,
        workspaceId: lead.workspace_id,
        reason: shouldRecover ? recoveryReason : `Escalated to level ${nextLevel}`,
      }).catch(() => {});
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
