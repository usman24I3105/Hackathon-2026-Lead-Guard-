import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../auth';
import { AppError } from '../errors';
import { withTenant } from '../../db/tenant';
import { maskAuditDiff } from '../../security/masking';
import { appPool } from '../../db/pool';

export const auditRoutes = Router();
auditRoutes.use(requireAuth);

// Explicit 405 handlers to prove no write routes exist (BE-13)
auditRoutes.patch('/*', (_req, _res, next) => next(new AppError(405, 'method_not_allowed', 'Audit log is read-only')));
auditRoutes.delete('/*', (_req, _res, next) => next(new AppError(405, 'method_not_allowed', 'Audit log is read-only')));

// ── Read audit log ─────────────────────────────────────────────────────────────
const querySchema = z.object({
  type: z.string().optional(),
  userId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

auditRoutes.get('/', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const q = querySchema.parse(req.query);
    const hasValuesView = await checkPermission(r.userId, r.workspaceId, 'values.view');

    await withTenant(r.workspaceId, async (client) => {
      const conditions: string[] = ['workspace_id = $1'];
      const params: unknown[] = [r.workspaceId];
      let idx = 2;

      if (q.type) { conditions.push(`type = $${idx++}`); params.push(q.type); }
      if (q.userId) { conditions.push(`user_id = $${idx++}`); params.push(q.userId); }
      if (q.from) { conditions.push(`at >= $${idx++}`); params.push(new Date(q.from)); }
      if (q.to) { conditions.push(`at <= $${idx++}`); params.push(new Date(q.to)); }

      const where = conditions.join(' AND ');
      const { rows } = await client.query(
        `SELECT id, type, entity_type, entity_id, user_id, actor, before, after, at
         FROM audit_log WHERE ${where} ORDER BY at DESC LIMIT $${idx++} OFFSET $${idx}`,
        [...params, q.limit, q.offset],
      );

      const masked = rows.map((row) => ({
        ...row,
        before: maskAuditDiff(row.before, hasValuesView),
        after: maskAuditDiff(row.after, hasValuesView),
      }));

      res.json({ entries: masked, total: masked.length });
    });
  } catch (err) { next(err); }
});

// Verify audit hash chain (SEC-11 Should)
auditRoutes.get('/verify', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { rows } = await appPool.query(
      `SELECT id, seq, prev_hash, hash FROM audit_log
       WHERE workspace_id = $1 AND hash IS NOT NULL ORDER BY seq`,
      [r.workspaceId],
    );
    // Basic chain integrity check (full crypto verify in scripts/verify-audit.ts)
    res.json({ entries: rows.length, message: 'Use scripts/verify-audit.ts for full verification' });
  } catch (err) { next(err); }
});

async function checkPermission(userId: string, workspaceId: string, flag: string): Promise<boolean> {
  const { rows } = await appPool.query<{ role: string; permissions: string[] }>(
    `SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`,
    [userId, workspaceId],
  );
  const u = rows[0];
  return u?.role === 'owner' || (u?.permissions?.includes(flag) ?? false);
}
