import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

/**
 * Backfills contact_event from data that predates the history log
 * (contacts, messages, payments, opportunities, appointments).
 * Idempotent: every row carries a source_ref with a unique index.
 * Run: npx tsx src/db/backfill-history.ts
 */
export async function backfillHistory(client: PoolClient): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', '004_customizable_crm.sql'), 'utf8');
  const section = sql.slice(sql.indexOf('-- ── Backfill history'));
  await client.query(section);
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL_MIGRATOR'] });
  pool.connect()
    .then(async (client) => { await backfillHistory(client); client.release(); console.log('✅ History backfill complete'); })
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => pool.end());
}
