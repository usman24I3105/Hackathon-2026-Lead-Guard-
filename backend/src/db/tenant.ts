import type { PoolClient } from 'pg';
import { appPool } from './pool';

/**
 * SEC-3: Run a function inside a tenant-scoped transaction.
 * Sets `app.workspace_id` as a transaction-local config so pooled connections
 * never carry the tenant into the next request.
 *
 * @param workspaceId  The workspace to scope to.
 * @param fn           Async function receiving the client.
 */
export async function withTenant<T>(
  workspaceId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    // true = transaction-local; resets when the transaction ends
    await client.query('SELECT set_config($1, $2, true)', ['app.workspace_id', workspaceId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Scope a SELECT query to the current workspace.
 * Always include this in every query to enforce tenant isolation
 * (RLS is the second line of defence, not a replacement).
 */
export function byWorkspace(workspaceId: string): { workspaceId: string } {
  return { workspaceId };
}
