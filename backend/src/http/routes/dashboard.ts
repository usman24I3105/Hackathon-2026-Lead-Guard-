import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { withTenant } from '../../db/tenant';

import { maskValues } from '../../security/masking';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);

/**
 * BE-12: Dashboard — 8 tiles, role-aware (personal scope for non-managers).
 * All metrics computed from stored rows (no cached numbers).
 * SEC-7: Value masking applied to tiles and drill-downs.
 */
dashboardRoutes.get('/', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows: userRows } = await client.query<{ role: string; permissions: string[]; id: string }>(
        `SELECT role, permissions, id FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [r.userId, r.workspaceId],
      );
      const user = userRows[0];
      const isManager = user?.role === 'owner' || user?.role === 'admin' || user?.permissions?.includes('team.manage');
      const hasValuesView = user?.role === 'owner' || (user?.permissions?.includes('values.view') ?? false);
      const scope = isManager ? null : r.userId;

      const scopeClause = scope ? `AND owner_id = $2` : '';
      const scopeParams = scope ? [r.workspaceId, scope] : [r.workspaceId];

      const [newLeads, escalated, recovery, collected, avgTTFR, openLeads, teamActivity, onLeave] = await Promise.all([
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM lead WHERE workspace_id = $1 ${scopeClause} AND created_at > NOW() - INTERVAL '24 hours'`,
          scopeParams,
        ),
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM audit_log WHERE workspace_id = $1 AND type = 'lead.escalated' AND at > NOW() - INTERVAL '24 hours'`,
          [r.workspaceId],
        ),
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM lead WHERE workspace_id = $1 ${scopeClause} AND state = 'recovery'`,
          scopeParams,
        ),
        client.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_cents - refunded_cents), 0) AS total FROM payment WHERE workspace_id = $1 AND status = 'paid'`,
          [r.workspaceId],
        ),
        client.query<{ avg: string }>(
          `SELECT COALESCE(AVG(time_to_first_response), 0) AS avg FROM lead WHERE workspace_id = $1 ${scopeClause} AND time_to_first_response IS NOT NULL`,
          scopeParams,
        ),
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM lead WHERE workspace_id = $1 ${scopeClause} AND state = 'waiting'`,
          scopeParams,
        ),
        client.query<{ user_id: string; name: string; count: string }>(
          `SELECT l.owner_id AS user_id, u.name, COUNT(l.id) AS count
           FROM lead l JOIN "user" u ON u.id = l.owner_id
           WHERE l.workspace_id = $1 AND l.created_at > NOW() - INTERVAL '24 hours'
           GROUP BY l.owner_id, u.name ORDER BY count DESC LIMIT 5`,
          [r.workspaceId],
        ),
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM "user" WHERE workspace_id = $1 AND status = 'on_leave'`,
          [r.workspaceId],
        ),
      ]);

      res.json(maskValues({
        tiles: {
          newLeads: parseInt(newLeads.rows[0].total),
          escalated: parseInt(escalated.rows[0].total),
          recovery: parseInt(recovery.rows[0].total),
          collected: parseInt(collected.rows[0].total),
          avgResponseTime: Math.round(parseFloat(avgTTFR.rows[0].avg)),
          openLeads: parseInt(openLeads.rows[0].total),
          teamActivity: teamActivity.rows,
          onLeave: parseInt(onLeave.rows[0].total),
        },
        scope: isManager ? 'workspace' : 'personal',
      }, hasValuesView));
    });
  } catch (err) { next(err); }
});

// ── Drill-downs ───────────────────────────────────────────────────────────────
dashboardRoutes.get('/drill/new-leads', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT l.id, l.state, l.escalation_count, l.created_at, c.name AS contact_name, c.phone_e164
         FROM lead l JOIN contact c ON c.id = l.contact_id
         WHERE l.workspace_id = $1 AND l.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY l.created_at DESC`,
        [r.workspaceId],
      );
      res.json({ leads: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});

dashboardRoutes.get('/drill/escalated', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT entity_id AS lead_id, at, after FROM audit_log
         WHERE workspace_id = $1 AND type = 'lead.escalated' AND at > NOW() - INTERVAL '24 hours'
         ORDER BY at DESC`,
        [r.workspaceId],
      );
      res.json({ events: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});

dashboardRoutes.get('/drill/recovery', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT l.id, l.recovery_reason, l.escalation_count, l.created_at, c.name AS contact_name
         FROM lead l JOIN contact c ON c.id = l.contact_id
         WHERE l.workspace_id = $1 AND l.state = 'recovery'
         ORDER BY l.created_at DESC`,
        [r.workspaceId],
      );
      res.json({ leads: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});
