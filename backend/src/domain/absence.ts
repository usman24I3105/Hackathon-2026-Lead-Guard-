import type { PoolClient } from 'pg';
import { writeAudit } from './audit';
import { hub } from '../realtime/hub';
import type { Request } from 'express';

/**
 * BE-7: Handle user going on_leave.
 * - Waiting leads: reassign via round-robin (excluding the absent user)
 * - Acknowledged leads: set held_reason
 * - If no eligible user → manager + recovery state
 */
export async function handleAbsence(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  _req?: Request,
): Promise<void> {
  // Get all leads owned by the user
  const { rows: leads } = await client.query<{
    id: string;
    state: string;
    version: number;
  }>(
    `SELECT id, state, version FROM lead
     WHERE owner_id = $1 AND workspace_id = $2 AND state IN ('waiting', 'acknowledged')`,
    [userId, workspaceId],
  );

  for (const lead of leads) {
    if (lead.state === 'waiting') {
      // Reassign: temporarily exclude the absent user via settings override
      // We use a direct UPDATE with sub-select for the next eligible user
      const { rows: eligible } = await client.query<{ id: string; open_leads: string; max_open_leads: number }>(
        `SELECT u.id, u.max_open_leads,
                (SELECT COUNT(*) FROM lead WHERE owner_id = u.id AND state = 'waiting') AS open_leads
         FROM "user" u
         WHERE u.workspace_id = $1
           AND u.status = 'available'
           AND u.in_rotation = true
           AND u.id != $2`,
        [workspaceId, userId],
      );

      const filtered = eligible.filter((u) => parseInt(u.open_leads) < u.max_open_leads);
      const nextOwner = filtered[0];

      if (nextOwner) {
        await client.query(
          `UPDATE lead SET owner_id = $1, version = version + 1, updated_at = NOW()
           WHERE id = $2 AND workspace_id = $3`,
          [nextOwner.id, lead.id, workspaceId],
        );
        await writeAudit(client, {
          workspaceId,
          type: 'lead.reassigned',
          entityType: 'lead',
          entityId: lead.id,
          actor: 'system',
          after: { from: userId, to: nextOwner.id, reason: 'user_on_leave' },
        });
        hub.emit(workspaceId, 'lead.assigned', { leadId: lead.id, ownerId: nextOwner.id });
      } else {
        // No eligible → recovery
        await client.query(
          `UPDATE lead SET state = 'recovery', recovery_reason = 'No available employee (absence)',
                         version = version + 1, updated_at = NOW()
           WHERE id = $2 AND workspace_id = $3`,
          [lead.id, workspaceId],
        );
        hub.emit(workspaceId, 'lead.recovery', { leadId: lead.id });
      }
    } else if (lead.state === 'acknowledged') {
      // Set held_reason on acknowledged leads
      await client.query(
        `UPDATE lead SET held_reason = 'Owner on leave', updated_at = NOW()
         WHERE id = $1 AND workspace_id = $2`,
        [lead.id, workspaceId],
      );
    }
  }
}
