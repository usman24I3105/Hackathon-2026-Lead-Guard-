import { Pool } from 'pg';
import { encrypt } from './src/integrations/crypto';

const pool = new Pool({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/leadguard' });

async function seedCalendar() {
  const workspaceId = 'ws_demo';
  const userId = 'u_amina';

  const tokens = {
    access_token: 'ya29.demo_token_for_hackathon_testing',
    refresh_token: '1//demo_refresh_token',
    expires_in: 3600000,
  };

  const encrypted = await encrypt(JSON.stringify(tokens), workspaceId, 'google');
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000); // 1 year

  await pool.query(
    `INSERT INTO calendar_connection (id, workspace_id, user_id, provider, encrypted_tokens, expires_at, status)
     VALUES ($1, $2, $3, 'google', $4, $5, 'connected')
     ON CONFLICT (workspace_id, user_id, provider)
     DO UPDATE SET encrypted_tokens = $4, expires_at = $5, status = 'connected', updated_at = NOW()`,
    ['cal_amina_demo', workspaceId, userId, encrypted, expiresAt],
  );

  console.log('Seeded connected calendar for u_amina in ws_demo successfully.');
  await pool.end();
}

seedCalendar().catch(console.error);
