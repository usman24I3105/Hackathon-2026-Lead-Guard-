-- 007 — lg_event's parameter "contact" collided with the contact table name.
DROP FUNCTION IF EXISTS lg_event(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) CASCADE;
CREATE FUNCTION lg_event(p_ws TEXT, p_contact TEXT, p_opp TEXT, p_kind TEXT, p_payload JSONB, p_ref TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_contact IS NULL THEN RETURN; END IF;
  INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, actor_id, payload_json, source_ref)
  VALUES (p_ws, p_contact, p_opp, p_kind, lg_actor(), p_payload, p_ref)
  ON CONFLICT DO NOTHING;
  UPDATE contact SET last_activity_at = NOW() WHERE id = p_contact AND workspace_id = p_ws;
END;
$$;
