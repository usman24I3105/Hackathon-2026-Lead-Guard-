-- ============================================================
-- 001_schema.sql  — LeadGuard full schema (PostgreSQL 16)
-- Run as lg_migrator (schema owner)
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Workspace ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace (
  id                TEXT PRIMARY KEY,            -- ws_...
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  rr_cursor         TEXT,                        -- last assigned user id (round-robin)
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user" (
  id                TEXT PRIMARY KEY,            -- u_...
  workspace_id      TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'user', -- owner | admin | user
  permissions       JSONB NOT NULL DEFAULT '[]',  -- array of permission flags
  status            TEXT NOT NULL DEFAULT 'available', -- available | busy | on_leave
  in_rotation       BOOLEAN NOT NULL DEFAULT true,
  max_open_leads    INT  NOT NULL DEFAULT 10,
  telegram_chat_id  TEXT,
  backup_user_id    TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  manager_user_id   TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);

-- ── Session ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,          -- SHA-256 of raw cookie value
  expires_at      TIMESTAMPTZ NOT NULL,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reauth_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_token_hash ON session(token_hash);

-- ── Invite ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user',
  permissions     JSONB NOT NULL DEFAULT '[]',
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_by      TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pipeline & Stage ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  position        INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stage (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  pipeline_id         TEXT NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  position            INT  NOT NULL DEFAULT 0,
  required_field_ids  TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Custom fields ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_field (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  pipeline_id     TEXT NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,                 -- text | number | date | select | boolean
  options         JSONB,                         -- for select type
  position        INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Company ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  domain          TEXT,
  industry        TEXT,
  custom          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Contact ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  company_id      TEXT REFERENCES company(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT,
  phone_e164      TEXT,
  opted_out       BOOLEAN NOT NULL DEFAULT false,
  custom          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, phone_e164)
);

-- ── Opportunity ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunity (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id      TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  company_id      TEXT REFERENCES company(id) ON DELETE SET NULL,
  pipeline_id     TEXT NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL REFERENCES stage(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  value_cents     BIGINT NOT NULL DEFAULT 0,
  custom          JSONB NOT NULL DEFAULT '{}',
  version         INT  NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lead ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead (
  id                      TEXT PRIMARY KEY,
  workspace_id            TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  opportunity_id          TEXT REFERENCES opportunity(id) ON DELETE SET NULL,
  contact_id              TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  owner_id                TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  source                  TEXT NOT NULL DEFAULT 'manual', -- manual | form | whatsapp
  state                   TEXT NOT NULL DEFAULT 'waiting', -- waiting | acknowledged | recovery
  escalation_count        INT  NOT NULL DEFAULT 0,
  escalation_level        INT  NOT NULL DEFAULT 0,        -- 0=unassigned 1=L1 2=L2 3=L3
  ack_deadline            TIMESTAMPTZ,
  acknowledged_at         TIMESTAMPTZ,
  held_reason             TEXT,
  recovery_reason         TEXT,
  time_to_first_response  INT,                           -- seconds
  version                 INT  NOT NULL DEFAULT 1,        -- CAS field
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for sweeper: find overdue leads fast
CREATE INDEX IF NOT EXISTS idx_lead_sweeper
  ON lead(workspace_id, state, ack_deadline)
  WHERE state = 'waiting' AND ack_deadline IS NOT NULL;

-- ── Message ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  lead_id         TEXT REFERENCES lead(id) ON DELETE SET NULL,
  contact_id      TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,                 -- inbound | outbound
  channel         TEXT NOT NULL DEFAULT 'whatsapp',
  body            TEXT NOT NULL,
  provider_sid    TEXT,                          -- Twilio MessageSid
  status          TEXT NOT NULL DEFAULT 'sent',  -- sent | delivered | failed | received
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider_sid)
);

-- ── Payment ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  opportunity_id  TEXT NOT NULL REFERENCES opportunity(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | paid | expired | failed | refunded
  amount_cents    BIGINT NOT NULL DEFAULT 0,
  refunded_cents  BIGINT NOT NULL DEFAULT 0,
  version         INT  NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Calendar connection ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_connection (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'google',
  encrypted_tokens TEXT NOT NULL,               -- AES-GCM blob from crypto.ts
  expires_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'connected', -- connected | needs_reconnect
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, provider)
);

-- ── Appointment ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  lead_id         TEXT NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  google_event_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Integration config ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_config (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,                 -- twilio | stripe | telegram | google
  encrypted_config TEXT,                         -- AES-GCM blob
  hook_token_hash TEXT,                          -- SHA-256 of webhook path token
  last_ok_at      TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider)
);

-- ── Integration event ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_event (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  external_id     TEXT NOT NULL,                 -- e.g. Twilio MessageSid, Stripe event id
  event_type      TEXT,
  status          TEXT NOT NULL DEFAULT 'ok',    -- ok | duplicate | error
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider, external_id)
);

-- ── Notification ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  lead_id         TEXT REFERENCES lead(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  attempts        INT  NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,                 -- e.g. lead.created, lead.escalated
  entity_type     TEXT,
  entity_id       TEXT,
  before          JSONB,
  after           JSONB,
  actor           TEXT NOT NULL DEFAULT 'user',  -- user | system
  request_id      TEXT,
  -- SEC-11 hash chain (Should)
  seq             BIGINT,
  prev_hash       TEXT,
  hash            TEXT,
  at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace
  ON audit_log(workspace_id, at DESC);

-- ── Security event ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_event (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workspace_id    TEXT,                           -- nullable (pre-auth events)
  user_id         TEXT,
  type            TEXT NOT NULL,
  ip              TEXT,
  user_agent      TEXT,
  request_id      TEXT,
  details         JSONB
);

CREATE INDEX IF NOT EXISTS idx_security_event_workspace
  ON security_event(workspace_id, at DESC);
