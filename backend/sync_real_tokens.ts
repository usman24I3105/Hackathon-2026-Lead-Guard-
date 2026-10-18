import { Pool } from 'pg';
import fs from 'fs';
import { encrypt } from './src/integrations/crypto';

async function syncRealTokens() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:AbdulMateenBaig05@localhost:5432/LeadGuard' });
  const tokens = JSON.parse(fs.readFileSync('calendar_tokens.json', 'utf8'));
  const workspaceId = 'ws_demo';
  const users = ['u_amina', 'u_imran', 'u_dana', 'u_sara'];

  for (const userId of users) {
    const encrypted = await encrypt(JSON.stringify(tokens), workspaceId, 'google');
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await pool.query(
      `INSERT INTO calendar_connection (id, workspace_id, user_id, provider, encrypted_tokens, expires_at, status)
       VALUES ($1, $2, $3, 'google', $4, $5, 'connected')
       ON CONFLICT (workspace_id, user_id, provider)
       DO UPDATE SET encrypted_tokens = $4, expires_at = $5, status = 'connected', updated_at = NOW()`,
      ['cal_' + userId, workspaceId, userId, encrypted, expiresAt]
    );
  }
  console.log('✅ Real Google Calendar OAuth tokens linked to all demo users in database!');
  await pool.end();
}

syncRealTokens().catch(console.error);
