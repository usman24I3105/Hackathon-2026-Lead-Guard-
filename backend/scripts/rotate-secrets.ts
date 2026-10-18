/**
 * SEC-4 / BE-16: Secret rotation script
 * Re-encrypts all integration_config rows using the latest APP_SECRET and APP_SECRET_KEY_VERSION.
 *
 * Usage: npx tsx scripts/rotate-secrets.ts
 */
import { appPool } from '../src/db/pool';
import { decrypt, encrypt } from '../src/integrations/crypto';

async function rotateSecrets(): Promise<void> {
  console.log('🔄 Starting secrets rotation for all configured integrations...');

  const client = await appPool.connect();
  let rotatedCount = 0;

  try {
    const { rows } = await client.query<{
      id: string;
      workspace_id: string;
      provider: string;
      encrypted_config: string | null;
    }>(
      `SELECT id, workspace_id, provider, encrypted_config
       FROM integration_config
       WHERE encrypted_config IS NOT NULL`,
    );

    console.log(`Found ${rows.length} encrypted integration configurations.`);

    for (const row of rows) {
      if (!row.encrypted_config) continue;

      try {
        // Decrypt with either current or previous secret
        const plainJson = await decrypt(row.encrypted_config, row.workspace_id, row.provider);
        // Re-encrypt with the current secret and key version
        const reEncrypted = await encrypt(plainJson, row.workspace_id, row.provider);

        await client.query(
          `UPDATE integration_config
           SET encrypted_config = $1, updated_at = NOW()
           WHERE id = $2`,
          [reEncrypted, row.id],
        );
        rotatedCount++;
      } catch (err) {
        console.error(`❌ Failed to rotate secret for integration ${row.id} (${row.provider}):`, err);
      }
    }

    console.log(`✅ Rotation complete. ${rotatedCount}/${rows.length} configurations re-encrypted with active key.`);
  } finally {
    client.release();
    await appPool.end();
  }
}

rotateSecrets().catch((err) => {
  console.error('Rotation failed:', err);
  process.exit(1);
});
