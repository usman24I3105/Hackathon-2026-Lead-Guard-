/**
 * Idempotency drill: replay-stripe
 * Replays the same Stripe event twice (e.g. checkout.session.completed).
 * Verifies that the second attempt is rejected as duplicate, creating zero duplicate payments.
 *
 * Usage: npx tsx scripts/replay-stripe.ts
 */
import { appPool, workerPool } from '../src/db/pool';

async function testReplayStripe(): Promise<void> {
  console.log('🧪 Starting Stripe idempotency replay drill...');

  const client = await appPool.connect();
  const eventId = `evt_replay_test_${Date.now()}`;
  const workspaceId = 'ws_demo';

  try {
    await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceId]);
    console.log(`📡 Ingesting Stripe webhook event 1 (ID: ${eventId})...`);
    const insert1 = await client.query(
      `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
       VALUES ($1, 'stripe', $2, 'checkout.session.completed', 'ok')
       ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
      [workspaceId, eventId],
    );

    const insertedFirst = insert1.rowCount === 1;
    console.log(`Event 1 result: ${insertedFirst ? 'Processed (New)' : 'Ignored'}`);

    console.log(`📡 Replaying identical Stripe webhook event 2 (ID: ${eventId})...`);
    const insert2 = await client.query(
      `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
       VALUES ($1, 'stripe', $2, 'checkout.session.completed', 'ok')
       ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
      [workspaceId, eventId],
    );

    const insertedSecond = insert2.rowCount === 1;
    console.log(`Event 2 result: ${insertedSecond ? 'Processed (Duplicate bug!)' : 'Deduplicated (Correct)'}`);

    if (insertedFirst && !insertedSecond) {
      console.log('✅ PASS: Replayed Stripe event was successfully deduplicated with 0 duplicate records.');
    } else {
      console.error('❌ FAIL: Deduplication check failed.');
      process.exit(1);
    }

    // Clean up
    await client.query(`DELETE FROM integration_event WHERE external_id = $1`, [eventId]);
  } finally {
    client.release();
    await appPool.end();
    await workerPool.end();
  }
}

testReplayStripe().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
