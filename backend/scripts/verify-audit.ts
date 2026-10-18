/**
 * SEC-11 / BE-16: Audit log hash chain verification
 * Verifies cryptographic integrity of the audit log sequence per workspace.
 *
 * Usage: npx tsx scripts/verify-audit.ts [workspaceId]
 */
import crypto from 'crypto';
import { appPool } from '../src/db/pool';

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`);
  return '{' + pairs.join(',') + '}';
}

async function verifyAuditChain(workspaceId = 'ws_demo'): Promise<void> {
  console.log(`🔒 Verifying audit log hash chain for workspace: ${workspaceId}...`);

  const client = await appPool.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      seq: number;
      prev_hash: string | null;
      hash: string | null;
      type: string;
      entity_type: string;
      entity_id: string;
      actor: string;
      at: Date;
    }>(
      `SELECT id, seq, prev_hash, hash, type, entity_type, entity_id, actor, at
       FROM audit_log
       WHERE workspace_id = $1 AND hash IS NOT NULL
       ORDER BY seq ASC`,
      [workspaceId],
    );

    if (rows.length === 0) {
      console.log('ℹ️  No hashed audit entries found for this workspace. Chain is empty.');
      return;
    }

    let previousHash = '';
    let brokenRow: typeof rows[0] | null = null;

    for (const row of rows) {
      if (row.seq > 1 && row.prev_hash !== previousHash) {
        brokenRow = row;
        console.error(`❌ Chain broken at seq ${row.seq} (id: ${row.id}): expected prev_hash ${previousHash}, got ${row.prev_hash}`);
        break;
      }

      const payload = canonicalJson({
        id: row.id,
        seq: row.seq,
        type: row.type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        actor: row.actor,
      });

      const computedHash = crypto
        .createHash('sha256')
        .update((row.prev_hash ?? '') + payload)
        .digest('hex');

      if (row.hash && row.hash !== computedHash) {
        brokenRow = row;
        console.error(`❌ Hash tamper detected at seq ${row.seq} (id: ${row.id})`);
        break;
      }

      previousHash = row.hash ?? computedHash;
    }

    if (!brokenRow) {
      console.log(`✅ PASS: Audit log hash chain intact across all ${rows.length} rows.`);
    } else {
      process.exit(1);
    }
  } finally {
    client.release();
    await appPool.end();
  }
}

const targetWs = process.argv[2] ?? 'ws_demo';
verifyAuditChain(targetWs).catch((err) => {
  console.error('Audit verification error:', err);
  process.exit(1);
});
