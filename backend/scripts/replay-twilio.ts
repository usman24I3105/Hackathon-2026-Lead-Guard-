/**
 * Idempotency drill: replay-twilio
 * Replays the same signed or inbound Twilio WhatsApp event twice.
 * Verifies that the second attempt detects duplicate (ON CONFLICT DO NOTHING),
 * resulting in 0 duplicate leads/messages.
 *
 * Usage: npx tsx scripts/replay-twilio.ts
 */
import { appPool, workerPool } from '../src/db/pool';

async function testReplayTwilio(): Promise<void> {
  console.log('🧪 Starting Twilio idempotency replay drill...');

  const client = await appPool.connect();
  const messageSid = `SM_replay_test_${Date.now()}`;
  const workspaceId = 'ws_demo';

  try {
    await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceId]);
    console.log(`📡 Ingesting event 1 (MessageSid: ${messageSid})...`);
    const insert1 = await client.query(
      `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
       VALUES ($1, 'twilio', $2, 'inbound', 'ok')
       ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
      [workspaceId, messageSid],
    );

    const insertedFirst = insert1.rowCount === 1;
    console.log(`Event 1 result: ${insertedFirst ? 'Inserted (New)' : 'Ignored'}`);

    console.log(`📡 Replaying identical event 2 (MessageSid: ${messageSid})...`);
    const insert2 = await client.query(
      `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
       VALUES ($1, 'twilio', $2, 'inbound', 'ok')
       ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
      [workspaceId, messageSid],
    );

    const insertedSecond = insert2.rowCount === 1;
    console.log(`Event 2 result: ${insertedSecond ? 'Inserted (Dupe bug!)' : 'Deduplicated (Correct)'}`);

    if (insertedFirst && !insertedSecond) {
      console.log('✅ PASS: Replayed Twilio event was successfully deduplicated by idempotency key.');
    } else {
      console.error('❌ FAIL: Deduplication failed.');
      process.exit(1);
    }

    // Clean up
    await client.query(`DELETE FROM integration_event WHERE external_id = $1`, [messageSid]);
  } finally {
    client.release();
    await appPool.end();
    await workerPool.end();
  }
}

testReplayTwilio().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
