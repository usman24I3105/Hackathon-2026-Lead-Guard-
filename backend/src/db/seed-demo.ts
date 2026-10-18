import 'dotenv/config';
import { Pool } from 'pg';
import { hashPassword } from '../security/password';
import { backfillHistory } from './backfill-history';
import { seedCrmConfig, seedDemoOpportunities, seedSecondWorkspace } from './seed-crm';

/**
 * BE-15: Demo seed — implements contract §5 exactly.
 * Run: npm run seed:demo
 * Uses DATABASE_URL_MIGRATOR — never over HTTP.
 * Production guard: exits unless NODE_ENV != production OR --i-know flag is passed.
 */

const isBig = process.argv.includes('--big');
const iKnow = process.argv.includes('--i-know');

if (process.env['NODE_ENV'] === 'production' && !iKnow) {
  console.error('❌ Refusing to seed in production without --i-know flag');
  process.exit(1);
}

const migrationUrl = process.env['DATABASE_URL_MIGRATOR'];
if (!migrationUrl) {
  console.error('DATABASE_URL_MIGRATOR is not set');
  process.exit(1);
}

const OWNER_PASSWORD = process.env['DEMO_OWNER_PASSWORD'];
const USER_PASSWORD = process.env['DEMO_USER_PASSWORD'];

if (!OWNER_PASSWORD || !USER_PASSWORD) {
  console.error('DEMO_OWNER_PASSWORD and DEMO_USER_PASSWORD must be set in .env');
  process.exit(1);
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: migrationUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.workspace_id', 'ws_demo', true)");
    // Operator-only reset: allows the cascade through append-only history tables.
    await client.query("SELECT set_config('app.allow_purge', 'on', true)");

    console.log('🌱 Resetting demo data...');

    // Idempotent: delete existing demo workspace (CASCADE handles children)
    await client.query(`DELETE FROM workspace WHERE id IN ('ws_demo', 'ws_acme')`);

    // Create workspace
    await client.query(`
      INSERT INTO workspace (id, name, slug, settings) VALUES
      ('ws_demo', 'LeadGuard Demo', 'leadguard-demo', '{"ackWindowsSeconds": {"L1": 10, "L2": 20, "L3": 30}}')
    `);

    // Hash passwords
    const ownerHash = await hashPassword(OWNER_PASSWORD!);
    const userHash = await hashPassword(USER_PASSWORD!);

    // Create users (ids match contract §5)
    const users = [
      { id: 'u_amina', name: 'Amina (Owner)', email: 'amina@demo.com', role: 'owner', hash: ownerHash, status: 'available' },
      { id: 'u_imran', name: 'Imran', email: 'imran@demo.com', role: 'user', hash: userHash, status: 'available' },
      { id: 'u_dana', name: 'Dana', email: 'dana@demo.com', role: 'user', hash: userHash, status: 'available' },
      { id: 'u_sara', name: 'Sara', email: 'sara@demo.com', role: 'user', hash: userHash, status: 'available' },
      { id: 'u_zain', name: 'Zain', email: 'zain@demo.com', role: 'user', hash: userHash, status: 'busy' },
      { id: 'u_hira', name: 'Hira', email: 'hira@demo.com', role: 'user', hash: userHash, status: 'on_leave' },
    ];

    for (const u of users) {
      await client.query(`
        INSERT INTO "user" (id, workspace_id, email, password_hash, name, role, status, in_rotation)
        VALUES ($1, 'ws_demo', $2, $3, $4, $5, $6, $7)
      `, [u.id, u.email, u.hash, u.name, u.role, u.status, u.status === 'available']);
    }

    await seedCrmConfig(client);

    // Create sample contacts and leads (deadline far in future to avoid instant escalation)
    const farFuture = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    for (let i = 1; i <= (isBig ? 500 : 12); i++) {
      const contactId = `con_demo_${i}`;
      const leadId = `lead_demo_${i}`;
      await client.query(`
        INSERT INTO contact (id, workspace_id, name, phone_e164, owner_id, source, last_activity_at) VALUES ($1, 'ws_demo', $2, $3, 'u_imran', 'whatsapp', NOW())
      `, [contactId, `Demo Contact ${i}`, `+1555000${String(i).padStart(4, '0')}`]);
      await client.query(`
        INSERT INTO lead (id, workspace_id, contact_id, owner_id, state, ack_deadline, version)
        VALUES ($1, 'ws_demo', $2, 'u_imran', 'waiting', $3, 1)
      `, [leadId, contactId, farFuture]);
    }

    // Create 2 recovery leads
    for (let i = 1; i <= 2; i++) {
      const contactId = `con_rec_${i}`;
      const leadId = `lead_rec_${i}`;
      await client.query(`
        INSERT INTO contact (id, workspace_id, name, phone_e164, owner_id, source, last_activity_at) VALUES ($1, 'ws_demo', $2, $3, 'u_imran', 'whatsapp', NOW())
      `, [contactId, `Recovery Contact ${i}`, `+1555999${String(i).padStart(4, '0')}`]);
      await client.query(`
        INSERT INTO lead (id, workspace_id, contact_id, state, recovery_reason, version)
        VALUES ($1, 'ws_demo', $2, 'recovery', 'No available employee', 1)
      `, [leadId, contactId]);
    }

    await seedDemoOpportunities(client);
    await seedSecondWorkspace(client, ownerHash);
    await backfillHistory(client);

    await client.query('COMMIT');
    console.log(`✅ Demo seed complete. ${isBig ? '500' : '12'} leads created.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
