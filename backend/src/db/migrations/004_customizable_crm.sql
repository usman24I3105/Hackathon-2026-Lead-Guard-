-- ============================================================
-- 004_customizable_crm.sql — custom fields per entity, pipeline field sets,
-- stage types, saved lists, append-only contact history (+ backfill)
-- ============================================================

-- ── Custom field definitions ─────────────────────────────────────────────────
ALTER TABLE custom_field ALTER COLUMN pipeline_id DROP NOT NULL;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'opportunity'; -- contact | opportunity | company
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS help_text TEXT;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS required_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS must_be_true BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE custom_field ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
-- Legacy type names → new vocabulary
UPDATE custom_field SET type = 'select' WHERE type = 'dropdown';
UPDATE custom_field SET type = 'checkbox' WHERE type = 'boolean';
UPDATE custom_field SET key = trim(both '_' from regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g')) || '_' || substr(id, length(id) - 3)
  WHERE key IS NULL;
ALTER TABLE custom_field ALTER COLUMN key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_field_key ON custom_field(workspace_id, entity_type, key);

-- ── Pipelines & stages ───────────────────────────────────────────────────────
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'opportunity';
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE stage ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'open'; -- open | won | lost
ALTER TABLE stage ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE stage ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
UPDATE stage SET type = 'won'  WHERE type = 'open' AND lower(name) = 'won';
UPDATE stage SET type = 'lost' WHERE type = 'open' AND lower(name) = 'lost';

-- Which custom fields each pipeline shows (its OWN field set)
CREATE TABLE IF NOT EXISTS pipeline_field (
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  pipeline_id   TEXT NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  field_id      TEXT NOT NULL REFERENCES custom_field(id) ON DELETE CASCADE,
  visible       BOOLEAN NOT NULL DEFAULT true,
  position      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (pipeline_id, field_id)
);
INSERT INTO pipeline_field (workspace_id, pipeline_id, field_id, position)
  SELECT workspace_id, pipeline_id, id, position FROM custom_field WHERE pipeline_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- ── Contacts: owner + optimistic concurrency ─────────────────────────────────
ALTER TABLE contact ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE contact ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE company ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_contact_ws_owner ON contact(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_ws_activity ON contact(workspace_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_custom ON contact USING GIN (custom jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_opp_ws_contact ON opportunity(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_opp_ws_stage ON opportunity(workspace_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_opp_custom ON opportunity USING GIN (custom jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_lead_ws_contact ON lead(workspace_id, contact_id);

-- ── Saved lists: criteria, never a snapshot of ids ───────────────────────────
CREATE TABLE IF NOT EXISTS saved_list (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  owner_id      TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  entity_type   TEXT NOT NULL DEFAULT 'contact',
  filter_json   JSONB NOT NULL DEFAULT '{"op":"and","rules":[]}',
  columns       JSONB NOT NULL DEFAULT '[]',
  sort          JSONB,
  visibility    TEXT NOT NULL DEFAULT 'workspace', -- private | team | workspace
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_list_ws ON saved_list(workspace_id);

-- ── Contact history: one append-only log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_event (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id      TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  opportunity_id  TEXT,
  type            TEXT NOT NULL,
  actor_id        TEXT,               -- NULL = system
  payload_json    JSONB NOT NULL DEFAULT '{}',
  source_ref      TEXT,               -- e.g. message:<id>; makes backfill idempotent
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_event_page ON contact_event(workspace_id, contact_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_event_source ON contact_event(workspace_id, source_ref) WHERE source_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_contact_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contact_event is append-only';
END;
$$;
DROP TRIGGER IF EXISTS contact_event_immutable ON contact_event;
CREATE TRIGGER contact_event_immutable BEFORE UPDATE OR DELETE ON contact_event
  FOR EACH ROW EXECUTE FUNCTION prevent_contact_event_mutation();

-- ── RLS for the new tables ───────────────────────────────────────────────────
DO $rls$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['pipeline_field', 'saved_list', 'contact_event']) LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format($$CREATE POLICY tenant_isolation ON %s
      USING (workspace_id = current_setting('app.workspace_id', true))
      WITH CHECK (workspace_id = current_setting('app.workspace_id', true))$$, t);
  END LOOP;
END $rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_field, saved_list TO lg_app;
GRANT SELECT, INSERT ON contact_event TO lg_app, lg_worker;

-- ── Backfill history from data that predates this log ────────────────────────
-- Re-runnable: scripts/backfill-history.ts executes the same statements.
INSERT INTO contact_event (workspace_id, contact_id, type, payload_json, source_ref, created_at)
  SELECT workspace_id, id, 'contact.created', jsonb_build_object('name', name, 'backfilled', true), 'contact:' || id, created_at FROM contact
  ON CONFLICT DO NOTHING;
INSERT INTO contact_event (workspace_id, contact_id, type, payload_json, source_ref, created_at)
  SELECT workspace_id, contact_id,
         CASE WHEN status = 'failed' THEN 'message.failed' WHEN direction = 'inbound' THEN 'message.received' ELSE 'message.sent' END,
         jsonb_build_object('message_id', id, 'body', left(body, 280), 'channel', channel, 'error', error, 'backfilled', true),
         'message:' || id, created_at FROM message
  ON CONFLICT DO NOTHING;
INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, payload_json, source_ref, created_at)
  SELECT p.workspace_id, o.contact_id, o.id,
         CASE p.status WHEN 'paid' THEN 'payment.paid' WHEN 'failed' THEN 'payment.failed' ELSE 'payment.link_created' END,
         jsonb_build_object('payment_id', p.id, 'amount_cents', p.amount_cents, 'status', p.status, 'backfilled', true),
         'payment:' || p.id, p.created_at
  FROM payment p JOIN opportunity o ON o.id = p.opportunity_id
  ON CONFLICT DO NOTHING;
INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, payload_json, source_ref, created_at)
  SELECT workspace_id, contact_id, id, 'opportunity.created',
         jsonb_build_object('name', name, 'backfilled', true), 'opportunity:' || id, created_at FROM opportunity
  ON CONFLICT DO NOTHING;
INSERT INTO contact_event (workspace_id, contact_id, type, actor_id, payload_json, source_ref, created_at)
  SELECT a.workspace_id, l.contact_id, 'appointment.booked', a.user_id,
         jsonb_build_object('appointment_id', a.id, 'title', a.title, 'start_at', a.start_at, 'backfilled', true),
         'appointment:' || a.id, a.created_at
  FROM appointment a JOIN lead l ON l.id = a.lead_id
  ON CONFLICT DO NOTHING;
UPDATE contact c SET last_activity_at = e.at
  FROM (SELECT contact_id, max(created_at) AS at FROM contact_event GROUP BY contact_id) e
  WHERE e.contact_id = c.id AND c.last_activity_at IS NULL;
