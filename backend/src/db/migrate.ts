import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

/**
 * Migration runner — only for lg_migrator (operator command, never over HTTP).
 * Run: npm run migrate
 */
async function migrate(): Promise<void> {
  const migrationUrl = process.env['DATABASE_URL_MIGRATOR'];
  if (!migrationUrl) {
    console.error('DATABASE_URL_MIGRATOR is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: migrationUrl });

  // Create migration tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT id FROM _migrations WHERE filename = $1',
      [file],
    );
    if (rows.length > 0) {
      console.log(`⏭  Already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`⚡ Applying: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`✅ Applied:  ${file}`);
  }

  await pool.end();
  console.log('✅ All migrations complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
