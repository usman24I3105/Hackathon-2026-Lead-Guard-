import { Pool } from 'pg';
import { config } from '../config';

/**
 * App pool — used by HTTP request handlers.
 * Role: lg_app (SELECT/INSERT/UPDATE/DELETE with RLS enforced)
 */
export const appPool = new Pool({
  connectionString: config.DATABASE_URL_APP,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Worker pool — used by sweeper, outbox, webhook token lookup.
 * Role: lg_worker (BYPASSRLS; only the DML those jobs need)
 */
export const workerPool = new Pool({
  connectionString: config.DATABASE_URL_WORKER,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

appPool.on('error', (err) => {
  console.error('Unexpected error on idle app pool client', err);
});

workerPool.on('error', (err) => {
  console.error('Unexpected error on idle worker pool client', err);
});

export async function closePools(): Promise<void> {
  await Promise.all([appPool.end(), workerPool.end()]);
}
