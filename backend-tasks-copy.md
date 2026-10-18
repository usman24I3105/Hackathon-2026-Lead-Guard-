# Backend Tasks â€” LeadGuard

**Owner**: Person A (backend & integrations). **Contract**: `API-CONTRACT.md` (v1.1, needs a v1.2 bump, see "Contract and frontend impacts"). **Approach**: `backend-architect` â€” entities first, then endpoints, security/resilience built in, everything real unless the contract says seeded.
**Revision**: v2 â€” monolithic `backend/` layout, PostgreSQL with Row-Level Security, security tasks SEC-1â€¦SEC-12, Calendar demoted to Should.
**Clock**: the backend lane is about 330 min (see "Time fit"). Estimates are for an AI-assisted builder and are rough.

> **Numbering note.** Task IDs below follow this file. Edits that arrived under slightly different numbers were applied by content: foundation = BE-1, seed reset = BE-15, drills = BE-16, README/ship = BE-17.

---

## Stack and structure

**Stack**: TypeScript, Node 20, Express, **PostgreSQL 16 via `pg`**, `zod`, `argon2` (argon2id), `helmet`, `express-rate-limit`, `pino` (with redaction), `stripe` SDK, `twilio` helper for signature validation, plain `fetch` for Telegram and Google.

**Why Postgres (changed from SQLite)**: Row-Level Security, separate database roles, and enforced timeouts. The compare-and-swap escalation stays a single atomic `UPDATE â€¦ WHERE version = ? AND state = 'waiting' â€¦ RETURNING`, so it is just as safe.

**Monolith rules** (one repo, one deployable, one process):
- `backend/` is the whole server. Express serves the API, the SSE stream, the webhooks **and** the built React app from `backend/public`.
- The sweeper, notification outbox and SSE hub run **inside the same process**. There is no separate worker service. "Worker" only means a second database role and connection pool (see SEC-3).
- Layering is `routes â†’ domain â†’ db`. Integrations sit behind interfaces. Security code lives in one `security/` module that every layer imports. Nothing in `domain/` imports from `http/`.
- `frontend/` is a sibling folder. Its Vite build output goes to `backend/public`.

```
leadguard/
  frontend/                       # React + Vite â†’ builds into backend/public
  backend/                        # THE monolith (single deployable)
    package.json  package-lock.json  tsconfig.json
    .env.example  .gitleaks.toml  SECURITY.md  README.md
    public/                       # built frontend (served by Express)
    src/
      index.ts                    # boot: config â†’ pools â†’ migrate check â†’ sweeper â†’ outbox â†’ http
      config.ts                   # zod-validated env (fails fast)
      security/
        headers.ts                # helmet + CSP
        origin.ts                 # Origin/Referer check on mutations
        limits.ts                 # body-size limits, rate limiters, SSE caps
        password.ts               # argon2id + policy
        sessions.ts               # create/rotate/expire/end sessions, __Host- cookie
        lockout.ts                # login backoff
        security-events.ts        # writer for security_event
        masking.ts                # value-masking serializer
        redact.ts                 # pino redaction paths
      db/
        pool.ts                   # app pool (lg_app) + worker pool (lg_worker)
        tenant.ts                 # withTenant(workspaceId, fn): BEGIN + set_config(..., true)
        migrations/               # 001_schema.sql, 002_roles.sql, 003_rls.sql, â€¦
        migrate.ts                # runs as lg_migrator (operator command only)
        seed.ts  seed-demo.ts     # run as lg_migrator (operator command only)
      http/
        app.ts                    # middleware order below
        errors.ts                 # AppError + error handler (contract error shape)
        auth.ts  permissions.ts  scope.ts
        routes/                   # auth, team, crm, leads, dashboard, audit, messaging,
                                  # payments, calendar, integrations, public, stream
        webhooks/                 # twilio.ts, stripe.ts
      domain/
        assignment.ts  escalation.ts  absence.ts  acknowledge.ts
        recovery.ts  dashboard.ts  audit.ts
      integrations/
        twilio.ts  stripe.ts  telegram.ts  google.ts
        crypto.ts                 # AES-GCM, HKDF from APP_SECRET, key version, AAD
        notifier.ts               # Telegram queue + 3 retries (interface so Slack/email can swap in)
      realtime/hub.ts             # SSE hub, per-workspace fan-out, connection caps
    test/                         # smoke, drills, rls, authz-matrix (vitest or plain node scripts)
    scripts/
      smoke.sh  security.sh  replay-twilio.ts  replay-stripe.ts  double-sweep.ts
      verify-audit.ts  rotate-secrets.ts  masking-sweep.ts
    deploy/
      leadguard.service  sshd_config.d/  fail2ban/  pg_hba.snippet
      backup.sh  restore-check.sh  HARDENING.md
```

**Middleware order** (`http/app.ts`): requestId â†’ `X-Server-Time` â†’ helmet/CSP â†’ body-size limits (raw for `/webhooks/*`, JSON elsewhere) â†’ global rate limit â†’ Origin check â†’ session (`__Host-` cookie) â†’ per-user rate limit â†’ CSRF header check â†’ `withTenant` transaction â†’ route. Webhook routes skip session, Origin and CSRF, and are gated by hook token plus signature instead (SEC-5).

**Environment variables** (`.env.example`, no secrets in repo):
- Runtime: `NODE_ENV`, `PORT=3000`, `PUBLIC_BASE_URL` (**must equal** the URL Twilio signs), `CORS_ORIGINS=http://localhost:5173`, `TRUST_PROXY=1`.
- Database (three roles, see SEC-3): `DATABASE_URL_APP`, `DATABASE_URL_WORKER`, `DATABASE_URL_MIGRATOR` (migrator is used only by operator scripts, never by the running server).
- Secrets: `APP_SECRET` (â‰¥ 32 chars), `APP_SECRET_KEY_VERSION=1`, optional `APP_SECRET_PREVIOUS` for rotation.
- Sessions: `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_DAYS` (replace the old `SESSION_TTL_DAYS`), `COOKIE_NAME=__Host-sid`, `REAUTH_WINDOW_MINUTES=10`.
- Limits: `RATE_GLOBAL_PER_MIN`, `RATE_USER_PER_MIN`, `SSE_MAX_PER_USER`, `SSE_MAX_PER_WORKSPACE`, `BODY_LIMIT_KB`.
- Seeding: `DEMO_OWNER_PASSWORD`, `DEMO_USER_PASSWORD` (no passwords hard-coded in the repo).
- Providers: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `STRIPE_SECRET_KEY` (**restricted key**), `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Provider vars seed the demo workspace's encrypted `integration_config` rows (per-workspace credentials, Q10).

**Run locally**: `cd backend && npm ci && cp .env.example .env && npm run migrate && npm run seed:demo && npm run dev` â†’ API on `:3000`; the frontend dev server proxies `/api` and `/webhooks`. Tunnel only if not deployed: `cloudflared tunnel --url http://localhost:3000`, then set `PUBLIC_BASE_URL`.
Dev note: browsers accept `Secure` cookies on `http://localhost`. If one does not, set `COOKIE_NAME=sid` in dev only. Production must use `__Host-sid`.

---

## Tasks

Priority: **Must** = MVP. Slices follow `PLAN.md` (0 foundation, 1 core, 2 supporting, 3 wow + rest, 4 polish, 5 ship).

### Feature tasks

| ID | Task | Story / Req | Slice | Priority | Depends on | Est | Done when |
|----|------|-------------|-------|----------|------------|-----|-----------|
| BE-1 | Project setup in `backend/`, config, error handler, request id, CORS, raw-body capture, `GET /api/health`, **hardening steps from SEC-1**, **first deploy with public HTTPS URL** | M18, Q10, Q12 | 0 | Must | â€” | 10m | `GET /api/health` returns 200 on the **public** URL; security headers present |
| BE-2 | Schema + migrations on Postgres (all entities, `workspace_id` on **every** tenant table, unique idempotency index, `version` columns), **three DB roles with least privilege**, audit append-only triggers, **TRUNCATE trigger**, minimal seed | M10, Q3 | 0 | Must | BE-1 | 10m | Migration runs on empty DB; `UPDATE audit_log` and `TRUNCATE` abort; seed rows queryable |
| BE-3 | Auth: signup (workspace + Owner + default pipeline/settings), login/logout, `/api/me`, session cookie, CSRF header check; password hashing, rotation and lockout come from SEC-2 | M1, US-1, Q1 | 1 | Must | BE-2 | 5m | Signup creates Owner; refresh keeps session; 6th bad login in 1 min â†’ 429 |
| BE-4 | Permission middleware (`requirePermission`), workspace-scoping helper, team endpoints (list, create+invite link, permissions, status stub), accept-invite, **privilege rules** (nobody grants a permission they lack; Admin cannot create an Owner) | M2, US-2, Q2 | 1 | Must | BE-3 | 6m | No-permission call â†’ 403; other workspace id â†’ 404; Admin touching or creating Owner â†’ 403; granting an unheld permission â†’ 403 |
| BE-5 | Lead intake (public form with honeypot and **limits per IP and per phone**, manual), contact match, opportunity create, **round-robin assignment**, `ackDeadline`, **SSE hub** + `lead.created/assigned` | M5, M6, M17, US-4, G1 | 1 | Must | BE-4 | 8m | Form POST creates lead owned by an Available user in < 2 s; non-Available never picked; flooding one IP or one phone â†’ 429; browser `EventSource` receives `lead.assigned` |
| BE-6 | Ack endpoint + implicit-ack hooks, **sweeper (1 s) with CAS escalation L1â†’L2â†’L3**, chain-exhausted â†’ recovery, audit writer, SSE `lead.escalated/acknowledged/recovery` | M7, US-5, US-7, G2, FR-1â€“FR-5 | 1 | Must | BE-5 | 10m | Ignored lead moves at +10/+20/+30 s exactly once each; restart mid-timer still escalates once; double-sweep script â†’ 1 escalation |
| BE-7 | Absence reassignment on status change (immediate move of unacknowledged leads, `heldReason` on acknowledged, no-eligible â†’ manager + recovery) | M8, US-6 | 3 | Must | BE-6 | 4m | PUT status `on_leave` moves 2 waiting leads at once; acknowledged stays labelled |
| BE-8 | **Twilio WhatsApp**: inbound webhook (signature, dedupe `MessageSid`, contact match, new-lead creation, STOP), send, status callback, failed state + retry, opt-out block | M12, US-4, US-9, I1.1â€“I1.9 | 2 | Must | BE-5, SEC-4, SEC-5 | 10m | Real phone message creates lead + message; replayed payload creates nothing; forged signature â†’ 403 + rejected event; STOP blocks send (409) |
| BE-9 | **Stripe**: Checkout session from opportunity (restricted key), webhook (raw body, signature, dedupe `event.id`), paid/expired/failed/refunded, `refundedCents` | M13, US-10, I2.1â€“I2.8 | 2 | Must | BE-4, SEC-4, SEC-5 | 8m | Test card payment flips status + SSE `payment.updated`; replayed event = 1 payment; bad signature â†’ 400 |
| BE-10 | **Telegram notifier**: per-user chat id, escalation alert (escaped text), queue with 3 retries (2/5/10 s), each attempt logged, failure never blocks escalation | M14, US-8, I4.1â€“I4.4 | 3 | Must | BE-6, SEC-5 | 6m | Escalation â†’ Telegram message (lead, source, reason, link) within 10 s; bad token â†’ failure row, lead still escalates |
| BE-11 | CRM API: contacts, companies, opportunities (value gating, `If-Match`), `move` with stage-required fields, pipeline/stages CRUD with safe delete, custom fields, `/360` | M3, M4, US-2, US-3, F2.x | 2 | Must | BE-4 | 12m | Blocked move returns 422 with message; stage delete without `moveTo` â†’ 409; value key absent without `values.view`; 360 returns all sections |
| BE-12 | Recovery queue endpoint + dashboard (8 tiles, role-aware) + drill-downs | M9, M11, US-7, US-13, G5 | 3 | Must | BE-6, BE-11 | 8m | Each tile's `total` equals its drill-down `total`; User sees personal scope |
| BE-13 | Audit read API + integrations API (status, masked secrets, event log, `integration.changed` audit) + `integration_events` writer used by all providers | M10, M16, US-12, FR-6 | 3 | Must | BE-2, SEC-4 | 5m | `PATCH /api/audit/x` â†’ 405; integrations list shows real `lastOkAt`/`lastError` |
| BE-14 | **Google Calendar (thin)**: OAuth connect/callback/disconnect (**with token revocation**), token refresh, create event, `calendar_not_connected` / `needs_reconnect` guard | M15, US-11, I3.1â€“I3.3, I3.7 | 3 | **Should (demoted, see note)** | BE-4, SEC-4 | 15m | Event visible in real Google Calendar; revoked token â†’ status `needs_reconnect`, booking 409 with reason; disconnect revokes the Google token |
| BE-15 | `seed:demo` reset (full spec from contract Â§5, idempotent, < 5 s) + `--big` seed (500 records). **Operator command under the migrator role, never over HTTP. Demo passwords come from env.** | M18, G6, Q13 | 4 | Must | BE-11 | 5m | Seed returns app to demo start state; no HTTP route can trigger it; no hard-coded password in repo; 500-record list p95 < 300 ms |
| BE-16 | Hardening + drills: `scripts/smoke.sh` (core flow) **plus `scripts/security.sh` (SEC-6)** and the existing drills (forged webhooks, replayed Twilio/Stripe, double sweep, cross-workspace id, no-permission call, 3 scripted G4 requests) | G2, G4, Q5, Â§15 | 5 | Must | all | 8m | `smoke.sh` and `security.sh` pass twice against the deployed URL |
| BE-17 | README (start < 5 min, env, seed, tunnel, sandbox join phrase, limits), `.env.example`, `SECURITY.md`, **secret scan (gitleaks) and backup-restore check**, deploy config | M18, G6 | 5 | Must | all | 5m | Fresh clone runs from README; gitleaks clean; restore-check restores the latest backup into a scratch DB and counts match |
| BE-S1 | Free/busy conflict warning (`GET /api/employees/:id/busy`) | S1 | 4 | Stretch | BE-14 | 8m | Warning returned for overlapping slot |
| BE-S2 | Cancel appointment â†’ delete Google event | S2 | 4 | Stretch | BE-14 | 6m | Event removed in Google |
| BE-S3 | CSV export gated by `crm.export` (goes through the masking serializer) | S6 | 4 | Stretch | BE-11 | 5m | 403 without flag; no value column without `values.view` |

> **Note on BE-14.** Calendar is mandatory integration I3 in the problem statement. Demoting it saves about 20 min but is a real scope risk. Keep the BE-14 fallback (manual connect, pre-created event, recorded OAuth video) ready and state the limit honestly on the Integrations page.

### Security tasks

| ID | Task | Slice | Priority | Depends on | Est | Done when |
|----|------|-------|----------|------------|-----|-----------|
| SEC-1 | helmet/CSP, Origin check, body-size limits, global and per-user rate limits, SSE connection cap, `__Host-` session cookie | 0 | Must | BE-1 | 20m | Security headers present; foreign Origin on a mutation â†’ 403; oversized body â†’ 413; flood â†’ 429; 4th SSE stream for one user refused; cookie has `__Host-` prefix |
| SEC-2 | argon2id with OWASP parameters, password policy, session rotation and timeouts, lockout/backoff, separate `security_event` table | 1 | Must | BE-3 | 20m | Hash is argon2id; session id changes on login and on permission change; idle and absolute timeouts end sessions; backoff grows on repeated failures; 403s and throttles land in `security_event` and **not** in `audit_log` |
| SEC-3 | Postgres Row-Level Security on every tenant table (`FORCE`, per-request `set_config`), three roles (migrator, app, worker), `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` | 1 | Must (**drops to Should first if time runs out**) | BE-2 | 30m | A query with no `WHERE workspace_id` returns only the caller's workspace; no tenant context â†’ 0 rows; cross-tenant INSERT rejected; app role cannot TRUNCATE or touch `audit_log` beyond insert/select |
| SEC-4 | Secrets: HKDF-derived AES-GCM key with key version and workspace + provider as AAD; pino redaction; gitleaks pre-commit and deploy gate; Stripe restricted key; Google token revocation on disconnect | 2 | Must | BE-1 | 15m | Ciphertext fails to decrypt under a different workspace or provider; logs show `[Redacted]` for cookies and tokens; a planted fake secret blocks the commit; disconnect revokes at Google |
| SEC-5 | Webhooks: hook-token paths, signature verified before parsing, size limit, event-type allowlist, throttling of repeated failures, Telegram text escaping | 2 | Must | BE-1 | 10m | Unknown token â†’ 404; forged or altered body â†’ rejected before parsing; non-allowlisted event â†’ 200 ignored; 11th failure in a minute â†’ 429; `<b>` in a lead name arrives as plain text |
| SEC-6 | `scripts/security.sh`: endpoint Ã— role authorization matrix, cross-tenant sweep (expects 404), CSRF and Origin tests, cookie and header checks, SQLi/XSS payloads, mass-assignment and oversized-body tests | 5 | Must | all routes | 25m | Script exits 0 on the deployed URL and prints a pass/fail table |
| SEC-7 | Value-masking sweep across audit, drill-downs and exports | 4 | Must | BE-11, BE-12, BE-13 | 8m | For a user without `values.view`, no opportunity value appears in any list, detail, 360, dashboard, drill-down, audit diff or export |
| SEC-8 | VPS hardening: SSH key-only and no root login, fail2ban, unattended-upgrades; systemd sandboxing; `pg_hba.conf` scram on localhost only; `.env` mode 600; encrypted backups | 5 | Must | deploy target | 20m | `ssh root@` refused; password auth refused; `systemd-analyze security leadguard` shows the sandbox; Postgres not reachable from outside; `.env` is `-rw-------`; backup file is encrypted |
| SEC-9 | `npm audit` and committed lockfile as a deploy gate; run OWASP ZAP baseline, SSL Labs and securityheaders.com and save the screenshots | 5 | Must | deployed URL | 15m | Deploy fails on high/critical advisories; reports and screenshots saved in `docs/security-evidence/` |
| SEC-10 | Step-up reauth for sensitive actions | 4 | Should | BE-4 | 15m | Changing permissions, roles or integrations without a recent password check â†’ 401 `reauth_required` |
| SEC-11 | Audit hash chain plus verify | 4 | Should | BE-6 | 15m | `verify-audit.ts` passes on clean data and names the first broken row after a manual tamper in a scratch DB |
| SEC-12 | TOTP MFA for Owner and Admin | 4 | Stretch | SEC-2 | 30m | Owner and Admin login requires a valid TOTP code; recovery codes work once |

**Build order that avoids rework**: BE-1 + SEC-1 â†’ BE-2 â†’ **SEC-3 right after BE-2** (adding RLS after the queries exist is painful) â†’ BE-3 + SEC-2 â†’ BE-4 â†’ BE-5 â†’ BE-6 â†’ SEC-4 â†’ SEC-5 â†’ BE-8 / BE-9 / BE-10 â†’ the rest.

---

## Time fit

Planning figures (team estimate): about 293 min of backend work, plus about 150 min of security Must (about 180 with RLS). One backend lane of roughly 330 min cannot hold that alone.

Task-table check: BE Must without Calendar adds up to 120 min; SEC-1â€¦SEC-9 add up to 163 min (30 of those are RLS). Reconcile with the planning figures above before you start, because the lane budget depends on which number is right.

To make it fit:
1. **Calendar (BE-14) is back to Should**, saving about 20 min.
2. **Hand work to Claude Code** once its frontend work is done (it has about 3 h spare against its 149-minute estimate). Lane split:

| Lane | Tasks |
|---|---|
| Person A | BE-1 â€¦ BE-12, BE-14 (if time), SEC-1 â€¦ SEC-5, SEC-8, the screenshots in SEC-9 |
| Claude Code | SEC-6 (`security.sh` and tests), SEC-7 (masking sweep), the scan parts of SEC-9, BE-13 (read-only audit/integrations API), BE-15 (seed), BE-16 (drills), BE-17 (README, `SECURITY.md`, restore-check) â€” about 100 min in total |

3. **Cut order if you fall behind** (first to last): RLS (SEC-3) drops to Should â†’ SEC-10 / SEC-11 / SEC-12 stay out â†’ Calendar stays at Should â†’ dashboard breadth (keep 6 tiles) â†’ audit filters beyond type â†’ opt-out/refund edge cases. SEC-2, SEC-4, SEC-5 and SEC-6 carry the most value per minute, so they stay.
4. **Never cut**: signature verification, idempotency, CAS escalation, server-side permission checks (BE-3â€¦BE-6, BE-8, BE-9 core).

Added scope inside BE-1â€¦BE-5, BE-15â€¦BE-17 is counted in the SEC estimates, so those BE estimates are unchanged.

---

## Details per task

### BE-1 â€” Foundation
- **Files**: `config.ts`, `http/app.ts`, `http/errors.ts`, `security/*` (see SEC-1).
- **Rules**: env validated with zod at boot; middleware order as listed under "Middleware order". Errors always render the contract error shape with `requestId`. CORS allows only `CORS_ORIGINS` with credentials. `app.set('trust proxy', Number(TRUST_PROXY))` so rate limits see the real client IP behind the reverse proxy.
- **Edge cases**: unknown route â†’ `404 not_found`; body over the limit â†’ `413 payload_too_large` (was 400, align the contract); `X-Server-Time` header set in a global middleware; `X-Powered-By` disabled.
- **Tests**: health 200; error shape on a forced 500; CORS preflight from allowed vs disallowed origin.
- **Deploy early**: VPS behind Caddy or nginx (TLS), or a tunnel in minutes 0â€“10; record the final `PUBLIC_BASE_URL`.

### BE-2 â€” Schema, roles, triggers
- **Tables**: workspace, user, session, pipeline, stage, custom_field, company, contact, opportunity, lead, message, payment, calendar_connection, appointment, integration_config, integration_event, notification, audit_log, security_event, invite.
- **Tenant column**: **every** tenant table has `workspace_id`, join tables included (RLS needs it on each table; the old "carried transitively" exception is gone). Ids stay text (`ws_â€¦`, `u_amina`) so seed ids match the contract.
- **Constraints**: `UNIQUE(workspace_id, provider, external_id)` on inbound `integration_event`; `UNIQUE(workspace_id, provider_sid)` on message; index on `(workspace_id, state, ack_deadline)` for the sweeper.
- **Triggers** (Postgres functions that `RAISE EXCEPTION`): `BEFORE UPDATE OR DELETE` on `audit_log` and `security_event`; `BEFORE TRUNCATE` statement trigger on `audit_log`, `security_event` and the tenant tables.
- **Roles** (created in `002_roles.sql`, policies in SEC-3): see the table in SEC-3.
- **Tests**: duplicate inbound event insert fails; audit update aborts; TRUNCATE aborts.

### BE-3 â€” Auth
- **Endpoints**: AUTH-1â€¦AUTH-4.
- **Validation**: zod â€” email format, password â‰¥ 10 chars and â‰¤ 128 (kept at 10 so the existing frontend validation still matches), workspaceName 2â€“80. Email unique â†’ `409 email_taken` and **nothing created** (transaction).
- **Security**: hashing, session handling and lockout are specified in SEC-2. Same message for unknown email vs wrong password; constant-time compare.
- **Pre-tenant lookups**: session by token hash, user by email and invite by token happen before a workspace is known. Do them through small `SECURITY DEFINER` functions owned by the migrator that return the minimal row, then switch to `withTenant`.
- **Tests**: duplicate signup; 6th failure blocked; logout invalidates session server-side.

### BE-4 â€” Permissions and team
- **Endpoints**: AUTH-5, TEAM-1â€¦TEAM-5.
- **Rules**: `requirePermission(flag)` after authentication; Owner passes all; Admin passes all except actions on the Owner; "Manager" is a preset that expands to flags on write. `scope.ts` exposes `byWorkspace(q)` used by every query (RLS is the second line of defence, not a replacement). Foreign id â†’ 404. `team.manage` required for invite/permissions; status change allowed for self or `team.manage`.
- **Privilege rules**: a caller can grant or invite only permissions they hold themselves; an Admin cannot create, invite or promote to Owner; nobody can edit their own permission set upward.
- **Edge cases**: demoting the last Owner is rejected 422; invite token single-use, 7-day expiry; every permission or role change rotates the affected user's sessions (SEC-2).
- **Tests**: direct `PUT /api/integrations/twilio` without `integrations.manage` â†’ 403 **and no audit row** (the denial goes to `security_event`); workspace-B id from workspace A â†’ 404 (G4 scripted trio); Admin creating an Owner â†’ 403; granting an unheld permission â†’ 403.

### BE-5 â€” Intake, assignment, SSE
- **Endpoints**: LEAD-1â€¦LEAD-4, LEAD-9 shell, `GET /api/stream`.
- **Assignment** (`assignment.ts`): eligible = `status='available' AND in_rotation AND open_leads < maxOpenLeads`; pick next after a persisted cursor (`workspace.rr_cursor`) in a single transaction. None eligible â†’ manager, `state='recovery'`, reason `No available employee`. Contact matched by `phoneE164`; opportunity created in first stage.
- **Public form**: honeypot field `website` non-empty â†’ 201 no-op; **per-IP limit (10/min) and per-phone limit (for example 3/hour)**; phone normalised to E.164; no auth; the form resolves its workspace through a form token (definer function), never through a client-supplied workspace id.
- **SSE hub**: per-workspace `Set<Response>`; heartbeat every 15 s; headers `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`; payloads ids-only (contract Â§3); connection caps from SEC-1.
- **Tests**: seeded rotation gives Imran first, then Dana; Zain (busy) and Hira (on leave) never picked; 6 leads respect cap 5; 11th form post from one IP in a minute â†’ 429.

### BE-6 â€” Escalation engine (the core)
- **Modules**: `escalation.ts`, `acknowledge.ts`, `audit.ts`.
- **Sweeper**: `setInterval` 1 s plus immediate run at boot; scans overdue waiting leads on the worker pool; for each runs the contract CAS `UPDATE â€¦ WHERE id=? AND version=? AND state='waiting' AND acknowledged_at IS NULL RETURNING â€¦`; one row â†’ audit + notifier enqueue + SSE; zero rows â†’ skip. Wrap each lead in its own transaction and set the tenant context and an explicit `workspace_id` predicate on every per-lead write; one failing lead never stops the loop.
- **Chain**: L1 next eligible by rotation (not current owner), L2 `backupUserId`, L3 `managerUserId`; if the chosen target is the current owner, skip to next level. Manager window expiry â†’ stay with manager, `state='recovery'`, `recoveryReason='Chain exhausted'` (never unowned, FR-3).
- **Ack**: CAS on `version`; owner-only (`403 not_owner`); lost race â†’ `409 lead_moved`; stores `timeToFirstResponseSeconds`; implicit-ack hook is called from message send, note, stage move and appointment create **only if caller is the current owner** (FR-1).
- **Windows**: `ackWindowsSeconds[level]`, read per sweep so settings changes apply immediately.
- **Tests**: unit â€” chain order; integration â€” start lead, wait 35 s, assert 3 audit `lead.escalated` rows; kill/restart server at +5 s and assert the same; `double-sweep.ts` fires two concurrent sweeps â†’ 1 escalation.

### BE-7 â€” Absence
- **Endpoint**: TEAM-4. In one transaction: set status; for each `waiting` lead owned by the user â†’ reassign via assignment rules (excluding the user), audit `lead.reassigned` with actor system, **not** `escalationCount++`; for acknowledged leads set `heldReason`. Emit `user.status` + `lead.assigned` events.
- **Edge cases**: setting back to `available` clears `heldReason`; no eligible user â†’ manager + recovery.
- **Tests**: Dana â†’ on_leave with 2 waiting leads â†’ both move in < 1 s to Sara; Dana's rotation skip verified.

### BE-8 â€” Twilio
- **Endpoints**: MSG-1â€¦MSG-5, now under hook-token paths (SEC-5). Raw body required; validate with the Twilio helper using `PUBLIC_BASE_URL + req.originalUrl`, **before** parsing the form body.
- **Rules**: dedupe via `INSERT â€¦ ON CONFLICT DO NOTHING` into `integration_event` in the same transaction as the message insert; `From=whatsapp:+â€¦` parsed to E.164; unknown number â†’ create contact + lead (calls BE-5 assignment); `STOP`/`STOPALL` â†’ `optedOut=true` + audit; send blocked with `409 opted_out`; send failure stores `status='failed'`, `error` text from Twilio (e.g. `63016`), one manual retry endpoint. The `AccountSid` in the payload must match the workspace's configured SID.
- **Edge cases**: status callback arriving before the send response (match by `MessageSid`; if unknown, log `ok` and ignore); status regression ignored (`delivered` never goes back to `sent`).
- **Tests**: `replay-twilio.ts` posts the same signed payload twice â†’ 1 message, 1 lead, 2nd logged `duplicate`; forged signature â†’ 403 and a `security_event` row.

### BE-9 â€” Stripe
- **Endpoints**: PAY-1â€¦PAY-3. Use `stripe.webhooks.constructEvent(rawBody, sig, secret)` with the workspace's endpoint secret; the API key is a **restricted key** (SEC-4).
- **Rules**: dedupe on `event.id`; map `checkout.session.completed` â†’ paid, `.expired` â†’ expired, `payment_intent.payment_failed` â†’ failed, `charge.refunded` â†’ refunded + `refundedCents`; `collected = Î£ paid âˆ’ Î£ refunded`; emit `payment.updated`; event types outside the allowlist â†’ 200 + `ok` log (SEC-5).
- **Tests**: `replay-stripe.ts` same event twice â†’ 1 payment; bad signature â†’ 400, no change.

### BE-10 â€” Telegram
- **Rules**: `notifier.ts` exposes `notify(userId, leadId, reason)`; persists a `notification` row and processes with delays 2 s / 5 s / 10 s; each attempt writes an `integration_event`; success â†’ `lastOkAt`; final failure â†’ `lastError` on integrations page. Never `await` it inside the escalation transaction. Lead names and sources are attacker-controlled (public form), so text is escaped and length-limited (SEC-5).
- **Message**: contract Â§2.8 text with deep link `PUBLIC_BASE_URL/leads/:id`.
- **Tests**: stub token â†’ 3 attempts logged, escalation unaffected.

### BE-11 â€” CRM
- **Endpoints**: CRM-1â€¦CRM-12. Move endpoint validates `requiredFieldIds` for the target stage against `opportunity.custom`; value gating implemented in the single serializer in `security/masking.ts` so no route can leak `valueCents`.
- **Rules**: stage delete requires `moveTo` when non-empty (transaction moves cards); `PATCH` requires `If-Match` â†’ `409 version_conflict`; custom-field type validated on write; zod `.strict()` on every body (mass-assignment protection); emit `config.changed` after pipeline/field/settings changes.
- **Tests**: US-3 acceptance trio; value key absent without `values.view` on list, detail, 360, dashboard.

### BE-12 â€” Recovery and dashboard
- **Rules**: recovery predicate per LEAD-9; dashboard metrics computed with SQL on stored rows (no cached numbers); `scope` = `personal` for non-managers. Definitions per contract Â§2.4.
- **Tests**: seed-based: 12 new leads today, 2 recovery, 5 escalations/24 h, collected 150000; `drill.total === tile` for all three demo drill-downs.

### BE-13 â€” Audit and integrations
- **Rules**: audit read filters `type`, `userId`, `from`, `to`; no write route (explicit 405 handlers for PATCH/DELETE to prove it); integrations responses mask secrets (`sk_test_â€¢â€¢â€¢â€¢4f2a`); `PUT` writes encrypted credentials with `crypto.ts` (SEC-4) and an `integration.changed` audit row; value changes in audit diffs are masked for users without `values.view` (SEC-7).
- **Stated limits** field text per provider (e.g. Twilio: "Sandbox reaches only phones that joined"; Google: "Testing mode â€” listed test users only").

### BE-14 â€” Google Calendar (thin, Should)
- **Rules**: `state` is a signed, expiring token tying the callback to the session; store encrypted access/refresh tokens; refresh when `expires_at` < now + 60 s; on `invalid_grant` set `needs_reconnect`; create event via `POST calendars/primary/events`; save `googleEventId`. **On disconnect**: call Google's token revocation endpoint for the refresh token, then delete the stored tokens even if the revoke call fails (log it).
- **Fallback** (PRD risk): if OAuth is not working by 11:20, connect once manually before the demo and show the pre-created event + recorded OAuth video; Integrations page states the limit honestly.
- **Tests**: not-connected employee â†’ 409 `calendar_not_connected` with name in message; disconnect â†’ revoke call recorded in `integration_event`.

### BE-15â€¦BE-17 â€” Seed, drills, ship
- `seed-demo.ts` implements contract Â§5 exactly (ids `u_amina`, `u_imran`â€¦ so mocks match). It runs as **an operator command under `DATABASE_URL_MIGRATOR`**. It is never exposed over HTTP, and `NODE_ENV=production` refuses to run it without an explicit `--i-know` flag. Demo passwords come from `DEMO_OWNER_PASSWORD` / `DEMO_USER_PASSWORD`; the old `demo-pass-123` is removed from code and docs. The sweeper must be stopped or windows paused during seed to avoid seeded `waiting` leads escalating instantly; seed sets their deadlines far in the future.
- `smoke.sh`: signup â†’ create lead via form â†’ poll lead owner â†’ wait â†’ assert escalated â†’ ack â†’ assert TTFR â†’ forged Twilio (403) â†’ replay Stripe (1 payment) â†’ cross-workspace 404 â†’ no-permission 403 â†’ audit PATCH 405.
- BE-16 also runs `security.sh` (SEC-6) and the existing drills against the deployed URL.
- BE-17 adds `SECURITY.md` (threat model in one page, roles, RLS design, secret rotation, how to run `security.sh`), a `gitleaks detect` run, and `restore-check.sh`.

### SEC-1 â€” HTTP hardening
- **Files**: `security/headers.ts`, `origin.ts`, `limits.ts`, `sessions.ts`.
- **helmet/CSP**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`. No `unsafe-inline` or `unsafe-eval`. If the built frontend needs inline styles, fix the frontend build rather than loosening the policy. Also HSTS (production), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`.
- **Origin check**: on POST/PUT/PATCH/DELETE for cookie-authenticated routes, `Origin` (or `Referer` as fallback) must be in the allowlist built from `PUBLIC_BASE_URL` and `CORS_ORIGINS`; otherwise 403 and a `security_event`. Webhook routes are exempt because they are signature-gated. The existing CSRF custom-header check stays as the second layer.
- **Body limits**: JSON default `BODY_LIMIT_KB` (100); raw webhook bodies capped separately (for example 128 kB); both return `413 payload_too_large`.
- **Rate limits**: global per IP (default 300/min) and per authenticated user (default 120/min), with `Retry-After` and `429 rate_limited`; stricter dedicated limits stay on login (BE-3), the public form (BE-5) and webhooks (SEC-5). One process means the in-memory store is fine; move to a Postgres-backed store if you ever run two instances.
- **SSE cap**: `SSE_MAX_PER_USER` (3) and `SSE_MAX_PER_WORKSPACE` (100); beyond the cap â†’ 429; sockets cleaned up on close and error.
- **Cookie**: `__Host-sid`; `HttpOnly; Secure; SameSite=Lax; Path=/`; no `Domain`. `Lax` (not `Strict`) so the Google OAuth redirect back to the callback still carries the session.
- **Tests**: header snapshot; foreign Origin 403; 101 kB body 413; SSE cap; cookie attributes.

### SEC-2 â€” Passwords, sessions, lockout, security events
- **Hashing** (`password.ts`): argon2id, parameters in config with OWASP-minimum defaults (memory 19 MiB, 2 iterations, parallelism 1; confirm against the current OWASP Password Storage cheat sheet). Rehash on successful login if parameters changed.
- **Policy**: length 10â€“128, reject a short list of very common passwords and anything containing the user's email local part; no composition rules.
- **Sessions** (`sessions.ts`): 32 random bytes, stored as SHA-256; **rotate** the session id on login, on password change, on role or permission change of that user, and on step-up. Idle timeout (`SESSION_IDLE_MINUTES`) and absolute timeout (`SESSION_ABSOLUTE_DAYS`); logout and "end all my sessions" delete rows server-side.
- **Lockout/backoff** (`lockout.ts`): extends the BE-3 throttle; per (email, ip) and per email, delay doubles per failure up to a cap (for example 15 min); temporary only, so an attacker cannot permanently lock a real user out; the response is identical whether or not the account exists.
- **`security_event` table**: `id, at, workspace_id (nullable), user_id (nullable), type, ip, user_agent, request_id, details jsonb`. Types: `login_ok`, `login_failed`, `login_throttled`, `forbidden`, `webhook_rejected`, `rate_limited`, `origin_rejected`, `session_rotated`. Never store secrets or request bodies in `details`. Append-only (same triggers as `audit_log`).
- **Why separate from `audit_log`**: US-2 requires that a denied change leaves no audit entry. 403s, throttles and rejected webhooks are recorded **only** in `security_event`.
- **Tests**: argon2id prefix on stored hash; session id differs before and after login; idle timeout; 403 creates a `security_event` and zero `audit_log` rows.

### SEC-3 â€” Row-Level Security, roles, timeouts
- **Roles**:

| Role | Used by | Privileges |
|---|---|---|
| `lg_migrator` | `migrate.ts`, `seed-demo.ts`, operators | Owns the schema, runs DDL. Never used by the running server. |
| `lg_app` | HTTP request handlers (app pool) | SELECT/INSERT/UPDATE/DELETE on tenant tables with RLS enforced; no TRUNCATE; `audit_log` and `security_event` INSERT and SELECT only |
| `lg_worker` | Sweeper, outbox, webhook token lookup (worker pool) | `BYPASSRLS`; only the DML those jobs need; `audit_log` INSERT only |

  > **Assumption to confirm**: "no write on `audit_log`" for the app role is implemented as INSERT + SELECT only (no UPDATE, DELETE or TRUNCATE). A role with no INSERT at all could not write audit rows in the same transaction as the change, which BE-6 requires.
- **Policies**: on every tenant table run `ENABLE` **and** `FORCE ROW LEVEL SECURITY`, then:
  ```sql
  CREATE POLICY tenant_isolation ON <table>
    USING      (workspace_id = current_setting('app.workspace_id', true))
    WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
  ```
  A missing setting evaluates to NULL, so the policy fails closed (zero rows).
- **Per-request transaction** (`db/tenant.ts`): `withTenant(workspaceId, fn)` runs `BEGIN; SELECT set_config('app.workspace_id', $1, true); â€¦; COMMIT`. The `true` makes the setting transaction-local, so pooled connections never carry a tenant into the next request. Every authenticated route runs inside it.
- **Worker pool**: bypasses RLS, so every per-lead write still sets the tenant context and keeps an explicit `workspace_id` predicate. Webhooks use the worker pool only to resolve the hook token to a workspace, then do their writes through `withTenant` on the app pool.
- **Timeouts**: set on the roles, for example `ALTER ROLE lg_app SET statement_timeout='5s'; lock_timeout='2s'; idle_in_transaction_session_timeout='10s'`. The worker role gets a longer statement timeout.
- **Privileges**: `REVOKE ALL ON ALL TABLES FROM PUBLIC`; explicit `GRANT`s per role; `ALTER DEFAULT PRIVILEGES` so new tables do not inherit broad grants.
- **Tests** (`test/rls.test.ts`): tenant A context never sees B rows even with `SELECT * FROM lead`; no context â†’ 0 rows; INSERT with B's `workspace_id` under A fails; `TRUNCATE` and `UPDATE audit_log` fail for `lg_app`; a pooled connection reused after a request carries no tenant.

### SEC-4 â€” Secrets
- **Encryption** (`integrations/crypto.ts`): derive the AES-256 key with HKDF-SHA256 from `APP_SECRET` (info string includes the key version). Stored blob format is `v<keyVersion>.<iv>.<tag>.<ciphertext>`. AAD is the string `workspaceId:provider`, so a ciphertext copied to another workspace or provider fails to decrypt. Rotation: decrypt by the version in the blob (current plus `APP_SECRET_PREVIOUS`), always encrypt with the current one; `scripts/rotate-secrets.ts` re-encrypts all rows.
- **Logging**: `security/redact.ts` configures pino to redact `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, and any `*.password`, `*.token`, `*.accessToken`, `*.refreshToken`, `*.secret`, `*.apiKey`; request bodies are not logged.
- **gitleaks**: `.gitleaks.toml`, a pre-commit hook and a deploy-pipeline gate (`gitleaks detect`).
- **Stripe**: use a restricted key (`rk_test_â€¦`) allowed to create Checkout Sessions and nothing else; webhook handling needs only the signing secret. Confirm the exact permission list in the Stripe dashboard.
- **Google**: on disconnect, call Google's OAuth token revocation endpoint, then delete the stored tokens.
- **Tests**: decrypt under wrong AAD fails; planted `sk_live_â€¦` string blocks the commit; log output for a login contains no password or cookie.

### SEC-5 â€” Webhook hardening
- **Paths**: `/webhooks/twilio/:hookToken/inbound`, `/webhooks/twilio/:hookToken/status`, `/webhooks/stripe/:hookToken`. The hook token is 32 random bytes per workspace per provider, stored as a SHA-256 hash and looked up through the worker pool. Unknown token â†’ `404`.
- **Order of checks**: size limit â†’ token lookup â†’ signature verification on the **raw bytes** â†’ only then parse JSON/form body.
- **Allowlist**: Stripe event types limited to the four in BE-9; anything else â†’ 200 and an `ok` log, no state change.
- **Throttle**: repeated failures (for example more than 10 per minute per IP and token) â†’ `429` for a cooldown, recorded as `webhook_rejected`.
- **Telegram text**: lead name, source and reason are attacker-controlled. Send as plain text (no `parse_mode`) or HTML-escape `& < >`, strip control characters, cap the length; the link is built only from `PUBLIC_BASE_URL`.
- **Tests**: unknown token 404; body altered by one byte â†’ rejected before parsing; `<b>x</b>` in a lead name arrives as literal text; 11 forged requests â†’ 429.

### SEC-6 â€” `scripts/security.sh`
Bash driver with small Node helpers; exits non-zero on any failure and prints a pass/fail table.
1. **Authorization matrix**: every route from the route manifest (generated from the router, so a new endpoint cannot be forgotten) Ã— roles (anonymous, User, Admin, Owner, user with only one permission, other-workspace Owner), compared with the expected statuses in `test/authz-matrix.json`.
2. **Cross-tenant sweep**: workspace B credentials against every endpoint that takes an id from workspace A â†’ expect `404`.
3. **CSRF and Origin**: missing or foreign Origin â†’ 403; missing CSRF header â†’ 403.
4. **Cookies and headers**: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite`, `Path=/`, no `Domain`; helmet headers present; no `X-Powered-By`; CSP has no `unsafe-inline`.
5. **Injection payloads**: SQLi strings in query and body fields (no 500, no data change); XSS strings stored and returned only as JSON data.
6. **Mass assignment**: bodies with extra keys (`workspaceId`, `role`, `permissions`, `valueCents`, `version`) â†’ 400.
7. **Oversized body**: 101 kB JSON â†’ 413.
8. **Throttle trip**: bad logins and a request flood trigger 429.

### SEC-7 â€” Value-masking sweep
- All value output goes through `security/masking.ts`. For a user without `values.view`, the sweep (`scripts/masking-sweep.ts`) walks list, detail, 360, dashboard tiles, every drill-down, audit diffs and exports and fails if any value-bearing key appears.
- In audit `before`/`after`, a value change is shown as a masked entry (field name only) to users without the permission.
- SSE payloads are ids-only, so they are checked only as a regression.

### SEC-8 â€” VPS hardening (`backend/deploy/`)
- **SSH**: `PermitRootLogin no`, `PasswordAuthentication no`, key-only, `AllowUsers` the deploy user; fail2ban jail for sshd; `unattended-upgrades` on; firewall allows only 22, 80, 443.
- **systemd** (`leadguard.service`): dedicated user; `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `ReadWritePaths=` limited to the log and state directories; `EnvironmentFile` pointing at `.env`.
- **Postgres**: `listen_addresses = 'localhost'`; `pg_hba.conf` allows only `host leadguard 127.0.0.1/32 scram-sha-256`; `password_encryption = scram-sha-256`.
- **Files**: `.env` mode 600 owned by the service user.
- **Backups**: `backup.sh` runs `pg_dump` and encrypts the output (age or gpg) with retention; `restore-check.sh` restores the latest backup into a scratch database and compares row counts.
- **Reverse proxy**: Caddy or nginx terminates TLS; for SSE keep proxy buffering off.
- **Check**: `ssh root@host` refused; password login refused; `systemd-analyze security leadguard`; port 5432 closed from outside.

### SEC-9 â€” Dependency and external scans
- `package-lock.json` committed; deploy uses `npm ci`; `npm audit --omit=dev --audit-level=high` fails the deploy.
- Run the OWASP ZAP baseline against the deployed URL, then SSL Labs and securityheaders.com; save reports and screenshots in `docs/security-evidence/`. The screenshots are a human step.

### SEC-10 â€” Step-up reauth (Should)
- `POST /api/auth/reauth {password}` records `reauth_at` on the session. Permission or role changes, integration changes and invites require a reauth within `REAUTH_WINDOW_MINUTES`, otherwise `401 reauth_required`. Pairs with the frontend ReauthDialog in `FRONTEND-TASKS.md`.

### SEC-11 â€” Audit hash chain (Should)
- Add `seq`, `prev_hash`, `hash = sha256(prev_hash â€– canonical_json(row))` per workspace. Inserts are serialized per workspace with `pg_advisory_xact_lock` inside the same transaction as the audited change. `scripts/verify-audit.ts` walks the chain and reports the first broken row. Because the app role is insert-only, rewriting history needs database-owner access.

### SEC-12 â€” TOTP MFA (Stretch)
- TOTP enrolment and verification for Owner and Admin; secret encrypted with `crypto.ts`; hashed one-time recovery codes; rate-limited verification; enforced at login.

---

## Cross-cutting

| Concern | Decision |
|---|---|
| Auth/validation | zod `.strict()` on every write; reject unknown keys; parameterized SQL only; output encoded by the framework (React) |
| Errors | One handler producing the contract shape; never leak stack traces; log with `requestId` |
| CORS and Origin | Allow only `CORS_ORIGINS` plus `PUBLIC_BASE_URL`; `credentials: true`; Origin check on mutations (SEC-1) |
| Rate limiting | Global and per-user (SEC-1), login backoff (SEC-2), public form per IP and phone (BE-5), webhook failure throttle (SEC-5) |
| Tenant isolation | `byWorkspace()` in queries **and** Postgres RLS with `FORCE` (SEC-3) |
| Logging | `pino` JSON with redaction, `requestId`, workspace id, no bodies on `/webhooks/stripe` or payment routes; secrets never logged |
| Transactions | State change + audit row + outbox (notification) in one transaction; SSE emitted after commit |
| Timers | Deadlines in DB only; sweeper is stateless |
| Secrets | `.env` only (mode 600); per-workspace credentials AES-GCM with HKDF and AAD; masked in API; never sent to browser or committed; gitleaks gate |
| Denied actions | Recorded in `security_event`, never in `audit_log` |
| Layering | routes â†’ domain â†’ db; integrations behind interfaces (Q14); one process, one deployable |

## Test plan

1. **Smoke (core flow)** â€” `scripts/smoke.sh`, run against local and deployed URLs.
2. **Security** â€” `scripts/security.sh` (SEC-6), `test/rls.test.ts` (SEC-3), masking sweep (SEC-7).
3. **Key negatives**: duplicate signup, 6th bad login, no-permission 403 (no audit row), foreign workspace id 404, forged Twilio 403, bad Stripe signature 400, honeypot no-op, opted-out send 409, stage delete without `moveTo` 409, stale `If-Match` 409, ack after escalation 409, foreign Origin 403, oversized body 413, Admin creating Owner 403.
4. **Concurrency/restart**: `double-sweep.ts` (2 sweeps â†’ 1 escalation); restart mid-countdown â†’ escalate once.
5. **Idempotency drill** (PRD Â§15): replay one Twilio and one Stripe event â†’ zero duplicates.
6. **Performance**: `--big` seed, list endpoints < 300 ms.
7. **Evidence**: ZAP baseline, SSL Labs, securityheaders.com, `npm audit`, gitleaks, restore-check output.

## Deployment

- **Target**: a hardened VPS (SEC-8) running the single `backend/` process under systemd, Postgres on localhost, Caddy or nginx for TLS. A tunnel (`cloudflared`) is the fallback for local demos.
- **Build/start**: `cd frontend && npm ci && npm run build` (output goes to `backend/public`) â†’ `cd backend && npm ci && npm run build` â†’ run migrations as `lg_migrator` â†’ start the service as the unprivileged user. Seeding is an operator command and never runs automatically in production.
- **Deploy gates**: `npm audit` (SEC-9), `gitleaks detect` (SEC-4), `smoke.sh` and `security.sh` (BE-16).
- **Provider console checklist**: Twilio inbound + status URLs â†’ `PUBLIC_BASE_URL/webhooks/twilio/<hookToken>/â€¦`; Stripe endpoint `â€¦/webhooks/stripe/<hookToken>` + signing secret; Google redirect URI + test users; Telegram bot started.
- **Fallback**: pre-recorded video (taken by 11:40), seeded DB snapshot, `scripts/replay-*` to re-inject saved sample payloads if a tunnel drops.

## Contract and frontend impacts (bump `API-CONTRACT.md` to v1.2)

- Webhook URLs now include `:hookToken`.
- New error codes: `413 payload_too_large`, `429 rate_limited`, `401 reauth_required` (SEC-10), `403` for a foreign Origin.
- New endpoints: `POST /api/auth/reauth` (SEC-10); `GET /api/audit/verify` if you expose the hash-chain check (SEC-11).
- Frontend: handle 413, 429 (show `Retry-After`) and `reauth_required`; the built bundle must work under a CSP with no inline scripts or styles and self-hosted fonts; no change needed for the cookie name.

