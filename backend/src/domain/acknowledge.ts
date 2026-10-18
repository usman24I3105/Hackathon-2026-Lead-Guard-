import type { PoolClient } from 'pg';
import { AppError } from '../http/errors';
import { writeAudit } from './audit';
import { hub } from '../realtime/hub';

/**
 * BE-6: Acknowledge a lead (owner only, CAS on version).
 * Also called implicitly from message send, note, stage move, appointment create
 * when the caller is the current owner.
 */
export async function acknowledge(
  client: PoolClient,
  workspaceId: string,
  leadId: string,
  userId: string,
): Promise<void> {
  const { rows } = await client.query<{
    id: string;
    owner_id: string;
    state: string;
    version: number;
    created_at: Date;
    acknowledged_at: Date | null;
  }>(
    `SELECT id, owner_id, state, version, created_at, acknowledged_at
     FROM lead WHERE id = $1 AND workspace_id = $2`,
    [leadId, workspaceId],
  );
  const lead = rows[0];
  if (!lead) throw new AppError(404, 'not_found', 'Lead not found');
  if (lead.owner_id !== userId) throw new AppError(403, 'not_owner', 'Only the lead owner can acknowledge');
  if (lead.state === 'acknowledged') return; // Already acked, no-op

  if (lead.state !== 'waiting') {
    throw new AppError(409, 'lead_moved', 'Lead has been moved from waiting state');
  }

  const ttfr = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 1000);

  const { rowCount } = await client.query(
    `UPDATE lead
     SET state = 'acknowledged',
         acknowledged_at = NOW(),
         time_to_first_response = $1,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3 AND version = $4 AND state = 'waiting'`,
    [ttfr, leadId, workspaceId, lead.version],
  );

  if (!rowCount || rowCount === 0) {
    throw new AppError(409, 'lead_moved', 'Lead was concurrently modified');
  }

  await writeAudit(client, {
    workspaceId,
    userId,
    type: 'lead.acknowledged',
    entityType: 'lead',
    entityId: leadId,
    actor: 'user',
    after: { state: 'acknowledged', ttfr },
  });

  hub.emit(workspaceId, 'lead.acknowledged', { leadId, ownerId: userId, ttfr });
}

/**
 * Implicit ack: called when the owner sends a message, note, moves a stage,
 * or creates an appointment — only if the caller is the current owner.
 */
export async function implicitAck(
  client: PoolClient,
  workspaceId: string,
  leadId: string,
  userId: string,
): Promise<void> {
  try {
    const { rows } = await client.query<{ owner_id: string; state: string }>(
      `SELECT owner_id, state FROM lead WHERE id = $1 AND workspace_id = $2`,
      [leadId, workspaceId],
    );
    const lead = rows[0];
    if (lead?.owner_id === userId && lead.state === 'waiting') {
      await acknowledge(client, workspaceId, leadId, userId);
    }
  } catch {
    // Implicit ack failures are non-fatal
  }
}
