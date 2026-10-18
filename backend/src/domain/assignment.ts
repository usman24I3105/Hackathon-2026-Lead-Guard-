import type { PoolClient } from 'pg';
import { AppError } from '../http/errors';

/**
 * BE-5 / BE-6: Assign a new lead to the next eligible user via round-robin.
 * Eligible = status='available' AND in_rotation AND open_leads < max_open_leads
 *
 * If no eligible user → assign to manager or recovery.
 * Returns the created lead row.
 */
export async function assignLead(
  client: PoolClient,
  workspaceId: string,
  leadId: string,
  contactId: string,
  opportunityId: string | undefined,
  source: string,
): Promise<{
  id: string;
  owner_id: string | null;
  state: string;
  ack_deadline: Date | null;
  version: number;
}> {
  // Get workspace settings and rr_cursor
  const { rows: wsRows } = await client.query<{
    rr_cursor: string | null;
    settings: { ackWindowsSeconds?: { L1: number; L2: number; L3: number }; managerUserId?: string };
  }>(
    `SELECT rr_cursor, settings FROM workspace WHERE id = $1`,
    [workspaceId],
  );
  const ws = wsRows[0];
  const ackWindows = ws?.settings?.ackWindowsSeconds ?? { L1: 10, L2: 20, L3: 30 };

  // Round-robin: find next eligible user after cursor
  const { rows: eligible } = await client.query<{
    id: string;
    open_leads: string;
    max_open_leads: number;
    manager_user_id: string | null;
  }>(
    `SELECT u.id, u.max_open_leads, u.manager_user_id,
            (SELECT COUNT(*) FROM lead WHERE owner_id = u.id AND state = 'waiting') AS open_leads
     FROM "user" u
     WHERE u.workspace_id = $1
       AND u.status = 'available'
       AND u.in_rotation = true
     ORDER BY u.id`,
    [workspaceId],
  );

  const eligibleFiltered = eligible.filter(
    (u) => parseInt(u.open_leads) < u.max_open_leads,
  );

  let ownerId: string | null = null;
  let state = 'waiting';
  let escalationLevel = 1;

  if (eligibleFiltered.length > 0) {
    const cursor = ws?.rr_cursor ?? null;
    let startIdx = 0;
    if (cursor) {
      const cursorIdx = eligibleFiltered.findIndex((u) => u.id > cursor);
      startIdx = cursorIdx >= 0 ? cursorIdx : 0;
    }
    const picked = eligibleFiltered[startIdx % eligibleFiltered.length];
    if (!picked) throw new AppError(500, 'assignment_error', 'Assignment failed');
    ownerId = picked.id;

    // Update round-robin cursor
    await client.query(
      `UPDATE workspace SET rr_cursor = $1 WHERE id = $2`,
      [ownerId, workspaceId],
    );
  } else {
    // No eligible user → manager or recovery
    const managerId = ws?.settings?.managerUserId ?? null;
    if (managerId) {
      ownerId = managerId;
      state = 'waiting';
    } else {
      state = 'recovery';
    }
    escalationLevel = 0;
  }

  const ackDeadline = state === 'waiting'
    ? new Date(Date.now() + ackWindows.L1 * 1000)
    : null;

  await client.query(
    `INSERT INTO lead (id, workspace_id, opportunity_id, contact_id, owner_id, source, state,
                      escalation_level, ack_deadline, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
    [leadId, workspaceId, opportunityId ?? null, contactId, ownerId, source, state, escalationLevel, ackDeadline],
  );

  return { id: leadId, owner_id: ownerId, state, ack_deadline: ackDeadline, version: 1 };
}
