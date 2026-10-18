-- 005 — Append-only logs stay immutable for the app. Only an operator script
-- running as the migrator (e.g. the demo reset) may purge a whole workspace,
-- and only by explicitly setting app.allow_purge for its transaction.
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Mutations on audit_log are not allowed';
END;
$$;
CREATE OR REPLACE FUNCTION prevent_contact_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'contact_event is append-only';
END;
$$;
