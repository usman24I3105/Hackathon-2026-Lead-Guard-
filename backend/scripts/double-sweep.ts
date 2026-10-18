/**
 * Concurrency drill: double-sweep test
 * Fires two concurrent sweeps against the same overdue lead.
 * Verifies that Compare-and-Swap (CAS) atomic UPDATE guarantees exactly ONE escalation.
 *
 * Usage: npx tsx scripts/double-sweep.ts
 */
import { workerPool } from '../src/db/pool';

async function testDoubleSweep(): Promise<void> {
  console.log('🧪 Starting double-sweep CAS concurrency drill...');

  const client = await workerPool.connect();
  const testLeadId = `lead_cas_test_${Date.now()}`;
  const workspaceId = 'ws_demo';

  try {
    // Insert a test waiting lead with deadline in past
    await client.query(
      `INSERT INTO lead (id, workspace_id, contact_id, state, escalation_level, ack_deadline, version)
       VALUES ($1, $2, 'con_demo_1', 'waiting', 1, NOW() - INTERVAL '10 seconds', 1)
       ON CONFLICT (id) DO UPDATE SET state = 'waiting', version = 1, ack_deadline = NOW() - INTERVAL '10 seconds'`,
      [testLeadId, workspaceId],
    );

    console.log(`📌 Created test lead ${testLeadId} at version 1 (waiting, overdue)`);

    // Simulate two concurrent sweep workers attempting to escalate the lead
    const worker1 = async () => {
      const c = await workerPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT set_config($1, $2, true)', ['app.workspace_id', workspaceId]);
        const res = await c.query(
          `UPDATE lead
           SET state = 'waiting',
               escalation_level = 2,
               escalation_count = escalation_count + 1,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2 AND version = 1 AND state = 'waiting'
           RETURNING id`,
          [testLeadId, workspaceId],
        );
        await c.query('COMMIT');
        return res.rowCount ?? 0;
      } catch (err) {
        await c.query('ROLLBACK');
        return 0;
      } finally {
        c.release();
      }
    };

    const worker2 = async () => {
      const c = await workerPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT set_config($1, $2, true)', ['app.workspace_id', workspaceId]);
        const res = await c.query(
          `UPDATE lead
           SET state = 'waiting',
               escalation_level = 2,
               escalation_count = escalation_count + 1,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2 AND version = 1 AND state = 'waiting'
           RETURNING id`,
          [testLeadId, workspaceId],
        );
        await c.query('COMMIT');
        return res.rowCount ?? 0;
      } catch (err) {
        await c.query('ROLLBACK');
        return 0;
      } finally {
        c.release();
      }
    };

    console.log('⚡ Firing two concurrent CAS updates simultaneously...');
    const [res1, res2] = await Promise.all([worker1(), worker2()]);

    const totalEscalations = res1 + res2;
    console.log(`Worker 1 result: ${res1 === 1 ? 'Won CAS (1)' : 'Lost CAS (0)'}`);
    console.log(`Worker 2 result: ${res2 === 1 ? 'Won CAS (1)' : 'Lost CAS (0)'}`);

    if (totalEscalations === 1) {
      console.log('✅ PASS: Exactly 1 worker succeeded. Atomic CAS prevented double-escalation!');
    } else {
      console.error(`❌ FAIL: Expected 1 escalation, got ${totalEscalations}`);
      process.exit(1);
    }

    // Clean up test lead
    await client.query(`DELETE FROM lead WHERE id = $1`, [testLeadId]);
  } finally {
    client.release();
    await workerPool.end();
  }
}

testDoubleSweep().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
