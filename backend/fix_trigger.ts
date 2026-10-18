import { Pool } from 'pg';

async function fixTrigger() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:AbdulMateenBaig05@localhost:5432/LeadGuard' });
  await pool.query(`
    CREATE OR REPLACE FUNCTION lg_event(p_ws TEXT, p_contact TEXT, p_opp TEXT, p_kind TEXT, p_payload JSONB, p_ref TEXT)
    RETURNS VOID LANGUAGE plpgsql AS $func$
    BEGIN
      IF p_contact IS NULL THEN RETURN; END IF;
      INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, actor_id, payload_json, source_ref)
      VALUES (p_ws, p_contact, p_opp, p_kind, lg_actor(), p_payload, p_ref)
      ON CONFLICT DO NOTHING;
      UPDATE contact c SET last_activity_at = NOW() WHERE c.id = p_contact AND c.workspace_id = p_ws;
    END;
    $func$;
  `);
  console.log('✅ lg_event SQL function fixed in PostgreSQL!');
  await pool.end();
}

fixTrigger().catch(console.error);
