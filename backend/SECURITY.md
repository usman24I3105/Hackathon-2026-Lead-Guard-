# LeadGuard Security Architecture & Threat Model (SEC-1 - SEC-12)

LeadGuard is engineered under a defense-in-depth model where multi-tenancy, secrets management, and failure modes are enforced at both application and database layers.

---

## 1. Threat Model & Boundaries

| Threat | Mitigation Mechanism | Verification |
|---|---|---|
| **Cross-Tenant Data Leakage** | PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) with transactional `set_config('app.workspace_id', ..., true)` + app-level `byWorkspace` scoping. | `test/rls.test.ts`, `scripts/security.sh` |
| **Escalation Race Conditions** | Atomic Compare-and-Swap (CAS) `UPDATE ... WHERE id = $1 AND version = $2 AND state = 'waiting' ... RETURNING id`. | `scripts/double-sweep.ts` |
| **Webhook Forgery & Tampering** | Signature verification on raw buffer **before** JSON/form parsing. Secret hook-tokens in URL paths. | `scripts/smoke.sh`, `scripts/security.sh` |
| **Credential & Secret Exposure** | AES-256-GCM authenticated encryption derived via HKDF-SHA256 from `APP_SECRET` with AAD `workspaceId:provider`. Key rotation support. | `scripts/rotate-secrets.ts` |
| **Privilege Escalation** | Rigid hierarchy: nobody can grant permissions they lack; Admins cannot create or modify Owners; self-permission promotion rejected. | `test/authz-matrix.json` |
| **Value / Financial Leakage** | Dedicated serializer `security/masking.ts` strips `valueCents`, `collected`, and financial diffs unless caller holds `values.view`. | `scripts/masking-sweep.ts` |
| **Audit Log Tampering** | PostgreSQL triggers disallow `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_log` and `security_event`. Cryptographic SHA-256 hash chaining. | `scripts/verify-audit.ts` |

---

## 2. Database Least-Privilege Roles

| Role | Connection URL | Allowed Operations |
|---|---|---|
| `lg_migrator` | `DATABASE_URL_MIGRATOR` | Schema ownership, DDL execution, operator migrations/seeds. **Never used by web process.** |
| `lg_app` | `DATABASE_URL_APP` | Standard web traffic pool. SELECT/INSERT/UPDATE/DELETE subject to RLS. No TRUNCATE. `statement_timeout = '5s'`. |
| `lg_worker` | `DATABASE_URL_WORKER` | Escalation sweeper, notification outbox. `BYPASSRLS` for scanning across tenants. |

---

## 3. Webhook Hardening (SEC-5)
All webhooks must be accessed via high-entropy secret token paths:
- Twilio Inbound: `/webhooks/twilio/:hookToken/inbound`
- Twilio Status: `/webhooks/twilio/:hookToken/status`
- Stripe Events: `/webhooks/stripe/:hookToken`

Webhook endpoints are exempt from session cookies and CSRF headers but enforce:
1. Max payload limit (128 KB raw).
2. Signature verification on raw byte stream.
3. Event type allowlisting.
4. Rate limiting on rejected/forged attempts (returns `429`).

---

## 4. Running Security Verifications
```bash
# 1. Run the comprehensive security suite (Authz matrix, CSRF, Origin, Headers, SQLi, Mass-assignment)
bash scripts/security.sh

# 2. Run Row-Level Security isolation tests
npm run test test/rls.test.ts

# 3. Run value-masking sweep (SEC-7)
npx tsx scripts/masking-sweep.ts

# 4. Verify audit log cryptographic hash chain (SEC-11)
npx tsx scripts/verify-audit.ts

# 5. Rotate integration secrets with new key version (SEC-4)
npx tsx scripts/rotate-secrets.ts
```
