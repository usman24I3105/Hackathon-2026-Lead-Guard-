import type { PoolClient } from 'pg';
import { workerPool } from '../db/pool';

interface AuditInput {
  workspaceId: string;
  userId?: string;
  type: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  actor: 'user' | 'system';
  requestId?: string;
}

/**
 * Write an audit_log row. Accepts either a pool client (for in-transaction writes)
 * or uses the workerPool directly (for sweeper writes that need BYPASSRLS).
 */
export async function writeAudit(
  clientOrNull: PoolClient | null,
  input: AuditInput,
): Promise<void> {
  const q = clientOrNull ?? workerPool;
  await q.query(
    `INSERT INTO audit_log
       (workspace_id, user_id, type, entity_type, entity_id, before, after, actor, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.workspaceId,
      input.userId ?? null,
      input.type,
      input.entityType ?? null,
      input.entityId ?? null,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.actor,
      input.requestId ?? null,
    ],
  );
}
