import type { Request } from 'express';
import { workerPool } from '../db/pool';
import logger from '../http/logger';

export type SecurityEventType =
  | 'login_ok'
  | 'login_failed'
  | 'login_throttled'
  | 'forbidden'
  | 'webhook_rejected'
  | 'rate_limited'
  | 'origin_rejected'
  | 'session_rotated';

interface SecurityEventInput {
  type: SecurityEventType;
  req: Request;
  workspaceId?: string;
  userId?: string;
  details?: Record<string, unknown>;
}

/**
 * SEC-2: Write a row to security_event.
 * Uses workerPool (BYPASSRLS) because some events have no workspace context yet.
 * Never throws — failures are only logged.
 */
export async function writeSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const requestId = (input.req as { requestId?: string }).requestId;
    await workerPool.query(
      `INSERT INTO security_event
         (id, at, workspace_id, user_id, type, ip, user_agent, request_id, details)
       VALUES
         (gen_random_uuid()::text, NOW(), $1, $2, $3, $4, $5, $6, $7)`,
      [
        input.workspaceId ?? null,
        input.userId ?? null,
        input.type,
        input.req.ip ?? null,
        input.req.headers['user-agent'] ?? null,
        requestId ?? null,
        input.details ? JSON.stringify(input.details) : null,
      ],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to write security_event');
  }
}
