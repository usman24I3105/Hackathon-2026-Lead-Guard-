import { Pool } from 'pg';
import { decrypt } from './src/integrations/crypto';

async function testBooking() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:AbdulMateenBaig05@localhost:5432/LeadGuard' });
  const res = await pool.query('SELECT encrypted_tokens FROM calendar_connection WHERE user_id = $1', ['u_amina']);
  const tokens = JSON.parse(await decrypt(res.rows[0].encrypted_tokens, 'ws_demo', 'google'));

  const eventPayload = {
    summary: 'TEST APPOINTMENT FROM CRM (VERIFIED LIVE)',
    description: 'Booked via LeadGuard CRM Google Calendar Integration',
    start: { dateTime: new Date(Date.now() + 7200000).toISOString() },
    end: { dateTime: new Date(Date.now() + 9000000).toISOString() },
  };

  const config = (await import('./src/config')).config;
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: config.GOOGLE_CLIENT_ID || '',
      client_secret: config.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });
  const refreshData = await refreshRes.json() as any;
  const activeAccessToken = refreshData.access_token || tokens.access_token;

  const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload),
  });

  const data = await gcalRes.json() as any;
  console.log('Status:', gcalRes.status, 'Event Link:', data.htmlLink);
  await pool.end();
}

testBooking().catch(console.error);
