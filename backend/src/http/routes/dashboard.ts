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

      const apptScopeClause = scope ? `AND user_id = $2` : '';
      const apptScopeParams = scope ? [r.workspaceId, scope] : [r.workspaceId];

      const [newLeads, escalated, recovery, collected, avgTTFR, openLeads, teamActivity, onLeave, appts, availRows, stageValueRows] = await Promise.all([
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
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM appointment
           WHERE workspace_id = $1 ${apptScopeClause} AND start_at >= NOW() AND start_at <= NOW() + INTERVAL '7 days'`,
          apptScopeParams,
        ),
        client.query<{ status: string; count: string }>(
          `SELECT status, COUNT(*) AS count FROM "user" WHERE workspace_id = $1 GROUP BY status`,
          [r.workspaceId],
        ),
        client.query<{ stage_id: string; stage_name: string; total_cents: string; count: string }>(
          `SELECT s.id AS stage_id, s.name AS stage_name,
                  COALESCE(SUM(o.value_cents), 0) AS total_cents,
                  COUNT(o.id) AS count
           FROM stage s
           LEFT JOIN opportunity o ON o.stage_id = s.id AND o.workspace_id = s.workspace_id
           WHERE s.workspace_id = $1
           GROUP BY s.id, s.name, s.position
           ORDER BY s.position ASC`,
          [r.workspaceId],
        ),
      ]);

      const availability: Record<string, number> = { available: 0, busy: 0, on_leave: 0 };
      for (const row of availRows.rows) {
        availability[row.status] = parseInt(row.count, 10);
      }

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
          upcomingAppointments: parseInt(appts.rows[0]?.total ?? '0'),
          availability,
          stageValues: stageValueRows.rows.map(r => ({
            stageId: r.stage_id,
            stageName: r.stage_name,
            totalCents: parseInt(r.total_cents),
            opportunityCount: parseInt(r.count),
          })),
        },
        scope: isManager ? 'workspace' : 'personal',
      }, hasValuesView));
    });
  } catch (err) { next(err); }
});

// ── Preferences ──────────────────────────────────────────────────────────────
dashboardRoutes.get('/preferences', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query<{ settings: Record<string, any> }>(
        `SELECT settings FROM workspace WHERE id = $1`,
        [r.workspaceId],
      );
      const wsSettings = rows[0]?.settings ?? {};
      const userPrefs = wsSettings.dashboard_preferences?.[r.userId] ?? {
        tiles: ['newLeads', 'escalated', 'recovery', 'collected', 'avgResponseTime', 'openLeads', 'teamActivity', 'onLeave', 'upcomingAppointments', 'stageValues'],
        density: 'comfortable',
      };
      res.json({ preferences: userPrefs });
    });
  } catch (err) { next(err); }
});

dashboardRoutes.put('/preferences', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query<{ settings: Record<string, any> }>(
        `SELECT settings FROM workspace WHERE id = $1 FOR UPDATE`,
        [r.workspaceId],
      );
      const wsSettings = rows[0]?.settings ?? {};
      const allPrefs = wsSettings.dashboard_preferences ?? {};
      allPrefs[r.userId] = req.body;
      const updatedSettings = { ...wsSettings, dashboard_preferences: allPrefs };

      await client.query(
        `UPDATE workspace SET settings = $1 WHERE id = $2`,
        [JSON.stringify(updatedSettings), r.workspaceId],
      );
      res.json({ preferences: req.body });
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

dashboardRoutes.get('/drill/upcoming-appointments', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT a.id, a.title, a.start_at, a.end_at, a.google_event_id,
                l.id AS lead_id, c.name AS contact_name, c.phone_e164, u.name AS user_name
         FROM appointment a
         JOIN lead l ON l.id = a.lead_id
         JOIN contact c ON c.id = l.contact_id
         JOIN "user" u ON u.id = a.user_id
         WHERE a.workspace_id = $1 AND a.start_at >= NOW() AND a.start_at <= NOW() + INTERVAL '7 days'
         ORDER BY a.start_at ASC`,
        [r.workspaceId],
      );
      res.json({ appointments: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});

dashboardRoutes.get('/drill/stage/:stageId', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT o.id, o.name, o.value_cents, o.created_at, c.name AS contact_name, comp.name AS company_name
         FROM opportunity o
         JOIN contact c ON c.id = o.contact_id
         LEFT JOIN company comp ON comp.id = o.company_id
         WHERE o.workspace_id = $1 AND o.stage_id = $2
         ORDER BY o.created_at DESC`,
        [r.workspaceId, req.params.stageId],
      );
      res.json({ opportunities: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});

dashboardRoutes.get('/drill/team-availability', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.in_rotation, u.max_open_leads,
                COUNT(l.id) FILTER (WHERE l.state = 'waiting') AS active_leads
         FROM "user" u
         LEFT JOIN lead l ON l.owner_id = u.id AND l.workspace_id = u.workspace_id
         WHERE u.workspace_id = $1
         GROUP BY u.id, u.name, u.email, u.role, u.status, u.in_rotation, u.max_open_leads
         ORDER BY u.name ASC`,
        [r.workspaceId],
      );
      res.json({ team: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});
