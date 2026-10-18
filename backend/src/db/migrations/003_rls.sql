-- ============================================================
-- 003_rls.sql  — Row-Level Security policies (SEC-3)
-- Run as lg_migrator after roles are created
-- ============================================================

-- Helper: enable FORCE RLS on a table, then add the isolation policy
-- FORCE means even the table owner is subject to RLS when querying via lg_app

DO $rls$ DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'workspace', '"user"', 'session', 'invite',
    'pipeline', 'stage', 'custom_field',
    'company', 'contact', 'opportunity',
    'lead', 'message', 'payment',
    'calendar_connection', 'appointment',
    'integration_config', 'integration_event',
    'notification', 'audit_log'
  ]) LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);

    -- Drop existing policy if re-running
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);

    -- workspace itself: allow only the row whose id matches
    IF t = 'workspace' THEN
      EXECUTE format($$
        CREATE POLICY tenant_isolation ON %s
          USING      (id = current_setting('app.workspace_id', true))
          WITH CHECK (id = current_setting('app.workspace_id', true))
      $$, t);
    ELSE
      EXECUTE format($$
        CREATE POLICY tenant_isolation ON %s
          USING      (workspace_id = current_setting('app.workspace_id', true))
          WITH CHECK (workspace_id = current_setting('app.workspace_id', true))
      $$, t);
    END IF;
  END LOOP;
END;
$rls$;

-- security_event: no workspace isolation (nullable workspace_id — pre-auth events)
-- lg_worker uses BYPASSRLS so no RLS needed for worker writes.
ALTER TABLE security_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_event_open ON security_event;
-- Allow all reads/inserts for now (security_event access is already role-gated)
CREATE POLICY security_event_open ON security_event USING (true) WITH CHECK (true);

-- ── Audit & Truncate protection triggers ─────────────────────────────────────

-- Prevent UPDATE and DELETE on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Mutations on audit_log are not allowed';
END;
$$;

DROP TRIGGER IF EXISTS no_update_audit_log ON audit_log;
CREATE TRIGGER no_update_audit_log
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- Prevent UPDATE and DELETE on security_event
DROP TRIGGER IF EXISTS no_update_security_event ON security_event;
CREATE TRIGGER no_update_security_event
  BEFORE UPDATE OR DELETE ON security_event
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- Prevent TRUNCATE on audit_log, security_event, and all tenant tables
CREATE OR REPLACE FUNCTION prevent_truncate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is not allowed on this table';
END;
$$;

DO $trg$ DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'audit_log', 'security_event',
    '"user"', 'workspace', 'session', 'invite',
    'pipeline', 'stage', 'custom_field',
    'company', 'contact', 'opportunity',
    'lead', 'message', 'payment',
    'calendar_connection', 'appointment',
    'integration_config', 'integration_event',
    'notification'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS no_truncate ON %s', t);
    EXECUTE format($$
      CREATE TRIGGER no_truncate
        BEFORE TRUNCATE ON %s
        FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate()
    $$, t);
  END LOOP;
END;
$trg$;
