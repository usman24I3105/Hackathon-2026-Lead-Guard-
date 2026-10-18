# LeadGuard Backend Monolith

Production-grade Express + PostgreSQL 16 backend for LeadGuard — real-time lead qualification, round-robin assignment, escalation sweepers, WhatsApp messaging (Twilio), Stripe payments, and Google Calendar sync.

---

## ⚡ Quick Start (< 5 Minutes)

### 1. Requirements
- Node.js >= 20
- PostgreSQL 16
- OpenSSL (for encryption)

### 2. Setup Environment
```bash
cd backend
cp .env.example .env
```
Ensure your PostgreSQL instance has the three least-privilege roles configured:
```sql
CREATE ROLE lg_migrator WITH LOGIN PASSWORD 'changeme_migrator' CREATEDB;
CREATE ROLE lg_app WITH LOGIN PASSWORD 'changeme_app';
CREATE ROLE lg_worker WITH LOGIN PASSWORD 'changeme_worker' BYPASSRLS;
CREATE DATABASE leadguard OWNER lg_migrator;
```

### 3. Install Dependencies & Migrate
```bash
npm install
npm run migrate
```

### 4. Seed Demo Data
Seeding is an operator-level command running under `lg_migrator`:
```bash
npm run seed:demo
# Or for performance testing with 500 records:
npm run seed:big
```

### 5. Start Development Server
```bash
npm run dev
```
- API Health Check: `http://localhost:3000/api/health`
- Real-time SSE Stream: `http://localhost:3000/api/stream`

---

## 🔌 Provider Integrations & Sandbox Notes

### Twilio WhatsApp
- **Endpoint**: `POST /webhooks/twilio/:hookToken/inbound`
- **Sandbox Join Phrase**: Send `join <sandbox-keyword>` to `+1 415 523 8886` to link test mobile numbers.
- **Limits**: Stated limit: Twilio sandbox reaches only numbers that have joined the sandbox session.
- **Opt-Out**: Replying `STOP` immediately marks contact `opted_out = true` and blocks future sends (409).

### Stripe Checkout
- **Endpoint**: `POST /webhooks/stripe/:hookToken`
- **Keys**: Uses restricted API key `rk_test_...` and webhook signing secret `whsec_...`.
- **Supported Events**: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`.

### Google Calendar
- **Endpoints**: `GET /api/integrations/google/connect`, `GET /api/integrations/google/callback`, `DELETE /api/integrations/google/disconnect`.
- **Disconnect**: Automatically calls Google token revocation endpoint.

---

## 🧪 Verification & Drills

Run the full automated test and verification suite:

```bash
# 1. Core flow smoke test
bash scripts/smoke.sh

# 2. Comprehensive security & authorization test suite
bash scripts/security.sh

# 3. Double-sweep CAS concurrency drill (1 escalation guarantee)
npx tsx scripts/double-sweep.ts

# 4. Twilio & Stripe webhook idempotency replay drills
npx tsx scripts/replay-twilio.ts
npx tsx scripts/replay-stripe.ts

# 5. SEC-7 value-masking sweep
npx tsx scripts/masking-sweep.ts

# 6. SEC-11 audit hash chain verification
npx tsx scripts/verify-audit.ts

# 7. Backup and restore verification
bash deploy/restore-check.sh
```

---

## 🛡️ Security & Hardening
See [SECURITY.md](file:///d:/Hackathon%202026/backend/SECURITY.md) and [deploy/HARDENING.md](file:///d:/Hackathon%202026/backend/deploy/HARDENING.md) for full architecture details on Row-Level Security, systemd sandboxing, and fail2ban configurations.
