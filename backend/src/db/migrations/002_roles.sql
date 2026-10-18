-- ============================================================
-- 002_roles.sql  — Database roles and privileges
-- Run as superuser / lg_migrator
-- ============================================================

-- Create roles (idempotent-ish — use DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lg_migrator') THEN
    CREATE ROLE lg_migrator WITH LOGIN PASSWORD 'changeme_migrator';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lg_app') THEN
    CREATE ROLE lg_app WITH LOGIN PASSWORD 'changeme_app';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lg_worker') THEN
    CREATE ROLE lg_worker WITH LOGIN PASSWORD 'changeme_worker' BYPASSRLS;
  END IF;
END $$;

-- Revoke all default public access
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO lg_migrator, lg_app, lg_worker;

-- lg_migrator owns the schema — full DDL rights
GRANT ALL PRIVILEGES ON DATABASE leadguard TO lg_migrator;
GRANT ALL ON SCHEMA public TO lg_migrator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO lg_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO lg_migrator;

-- lg_app: SELECT/INSERT/UPDATE/DELETE on tenant tables (RLS enforced by policies)
-- No TRUNCATE, no DDL
GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspace, "user", session, invite,
  pipeline, stage, custom_field,
  company, contact, opportunity,
  lead, message, payment,
  calendar_connection, appointment,
  integration_config, integration_event,
  notification
TO lg_app;

-- audit_log and security_event: INSERT and SELECT only for lg_app
GRANT SELECT, INSERT ON audit_log, security_event TO lg_app;

-- lg_worker: needs broader access (BYPASSRLS) for sweeper / outbox / webhook lookup
GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspace, "user", lead, notification,
  integration_config, integration_event,
  message, session
TO lg_worker;
GRANT SELECT, INSERT ON audit_log, security_event TO lg_worker;
GRANT SELECT ON invite TO lg_worker;

-- Sequence grants
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO lg_app, lg_worker;

-- Ensure future tables get the same rights
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lg_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO lg_app, lg_worker;

-- Role-level timeouts (SEC-3)
ALTER ROLE lg_app SET statement_timeout = '5s';
ALTER ROLE lg_app SET lock_timeout = '2s';
ALTER ROLE lg_app SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE lg_worker SET statement_timeout = '30s';
ALTER ROLE lg_worker SET lock_timeout = '5s';
ALTER ROLE lg_worker SET idle_in_transaction_session_timeout = '30s';
