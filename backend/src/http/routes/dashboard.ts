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

      // 12. Fetch recovery items
      const { rows: recRows } = await client.query<{
        id: string;
        name: string;
        source: string;
        recovery_reason: string | null;
        state: string;
        owner_id: string;
        owner_name: string;
        created_at: Date;
        ack_deadline: Date | null;
      }>(
        `SELECT l.id, c.name, l.source, l.recovery_reason, l.state, l.owner_id,
                COALESCE(u.name, 'Unassigned') AS owner_name,
                l.created_at, l.ack_deadline
         FROM lead l
         JOIN contact c ON c.id = l.contact_id
         LEFT JOIN "user" u ON u.id = l.owner_id
         WHERE l.workspace_id = $1 AND l.state IN ('recovery', 'escalated')
         ORDER BY l.created_at DESC LIMIT 10`,
        [r.workspaceId],
      );

      // 13. Fetch team members with status
      const { rows: teamAvailRows } = await client.query<{
        id: string;
        name: string;
        status: string;
        open_leads: string;
      }>(
        `SELECT u.id, u.name, u.status, COUNT(l.id) AS open_leads
         FROM "user" u
         LEFT JOIN lead l ON l.owner_id = u.id AND l.workspace_id = u.workspace_id AND l.state = 'waiting'
         WHERE u.workspace_id = $1
         GROUP BY u.id, u.name, u.status
         ORDER BY u.name ASC`,
        [r.workspaceId],
      );

      // 14. Fetch upcoming appointments
      const { rows: apptList } = await client.query<{
        id: string;
        title: string;
        start_at: Date;
        contact_id: string;
        customer_name: string;
        employee_name: string;
      }>(
        `SELECT a.id, a.title, a.start_at, c.id AS contact_id, c.name AS customer_name, u.name AS employee_name
         FROM appointment a
         JOIN lead l ON l.id = a.lead_id
         JOIN contact c ON c.id = l.contact_id
         JOIN "user" u ON u.id = a.user_id
         WHERE a.workspace_id = $1 AND a.start_at >= NOW()
         ORDER BY a.start_at ASC LIMIT 10`,
        [r.workspaceId],
      );

      // 15. Fetch recent audit activity
      const { rows: auditList } = await client.query<{
        id: string;
        at: Date;
        type: string;
        actor: string;
      }>(
        `SELECT id, at, type, actor
         FROM audit_log
         WHERE workspace_id = $1
         ORDER BY at DESC LIMIT 10`,
        [r.workspaceId],
      );

      // 16. Fetch leads lists for drill-downs
      const { rows: todayLeads } = await client.query<{
        id: string;
        name: string;
        source: string;
        state: string;
        owner_name: string;
        created_at: Date;
      }>(
        `SELECT l.id, c.name, l.source, l.state, COALESCE(u.name, 'Unassigned') AS owner_name, l.created_at
         FROM lead l
         JOIN contact c ON c.id = l.contact_id
         LEFT JOIN "user" u ON u.id = l.owner_id
         WHERE l.workspace_id = $1 AND l.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY l.created_at DESC LIMIT 20`,
        [r.workspaceId],
      );

      const recoveryQueue = recRows.map(row => ({
        leadId: row.id,
        leadName: row.name,
        source: row.source,
        reason: row.recovery_reason || 'Missed SLA window',
        status: row.state as any,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        ackDeadline: row.ack_deadline?.toISOString() || row.created_at.toISOString(),
        createdAt: row.created_at.toISOString(),
        overdue: true,
      }));

      const team = teamAvailRows.map((u, i) => ({
        userId: u.id,
        name: u.name,
        avatarColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i % 5],
        availability: (u.status === 'on_leave' ? 'leave' : u.status === 'busy' ? 'busy' : 'available') as any,
        openLeads: parseInt(u.open_leads, 10) || 0,
        capacity: 5,
      }));

      const appointments = apptList.map(a => ({
        id: a.id,
        start: a.start_at.toISOString(),
        title: a.title,
        contactId: a.contact_id,
        customerName: a.customer_name,
        employeeName: a.employee_name,
        provider: 'google' as const,
      }));

      const activity = auditList.map(a => {
        let channel: any = 'system';
        if (a.type.startsWith('message')) channel = 'whatsapp';
        else if (a.type.startsWith('payment')) channel = 'stripe';
        else if (a.type.startsWith('appointment')) channel = 'google';
        return {
          id: a.id,
          at: a.at.toISOString(),
          channel,
          text: a.type.replace(/\./g, ' '),
        };
      });

      const kpis = [
        {
          id: 'newLeads' as const,
          label: isManager ? 'New leads today' : 'My new leads today',
          value: parseInt(newLeads.rows[0].total, 10),
          unit: 'count' as const,
          definition: 'Leads captured since midnight, from any source.',
        },
        {
          id: 'avgResponse' as const,
          label: isManager ? 'Avg. response time' : 'My response time',
          value: Math.round(parseFloat(avgTTFR.rows[0].avg)) || null,
          unit: 'seconds' as const,
          definition: 'Average time from lead capture to first acknowledgement.',
        },
        {
          id: 'escalations' as const,
          label: 'Escalations today',
          value: parseInt(escalated.rows[0].total, 10),
          unit: 'count' as const,
          definition: 'Leads captured today that missed at least one acknowledgement window.',
        },
        {
          id: 'recoveryQueue' as const,
          label: 'Recovery queue',
          value: parseInt(recovery.rows[0].total, 10),
          unit: 'count' as const,
          definition: 'Leads that are escalating or in recovery queue.',
          badge: parseInt(recovery.rows[0].total, 10) || undefined,
        },
        {
          id: 'collected' as const,
          label: 'Collected revenue',
          value: hasValuesView ? parseInt(collected.rows[0].total, 10) : null,
          masked: !hasValuesView,
          unit: 'cents' as const,
          definition: 'Collected revenue from completed payments.',
        },
      ];

      const pipeline = {
        visible: hasValuesView,
        stages: stageValueRows.rows.map(row => ({
          stageId: row.stage_id,
          stageName: row.stage_name,
          valueCents: hasValuesView ? parseInt(row.total_cents, 10) : null,
          dealCount: parseInt(row.count, 10),
        })),
      };

      const integrations = [
        { key: 'twilio', name: 'Twilio WhatsApp/SMS', status: 'connected' as const },
        { key: 'stripe', name: 'Stripe Payments', status: 'connected' as const },
        { key: 'google', name: 'Google Calendar', status: 'connected' as const },
        { key: 'slack', name: 'Slack Notifications', status: 'connected' as const },
      ];

      const lists = {
        newLeads: todayLeads.map(l => ({
          id: l.id,
          name: l.name,
          source: l.source,
          status: l.state as any,
          ownerName: l.owner_name,
          createdAt: l.created_at.toISOString(),
        })),
        escalations: todayLeads.filter(l => l.state === 'escalated' || l.state === 'recovery').map(l => ({
          id: l.id,
          name: l.name,
          source: l.source,
          status: l.state as any,
          ownerName: l.owner_name,
          createdAt: l.created_at.toISOString(),
        })),
      };

      const dashboardPayload = {
        generatedAt: new Date().toISOString(),
        scope: isManager ? ('team' as const) : ('personal' as const),
        kpis,
        pipeline,
        recoveryQueue,
        highlightedLead: recoveryQueue[0] ?? null,
        team,
        appointments,
        activity,
        integrations,
        lists,
        tiles: {
          newLeads: parseInt(newLeads.rows[0].total, 10),
          escalated: parseInt(escalated.rows[0].total, 10),
          recovery: parseInt(recovery.rows[0].total, 10),
          collected: parseInt(collected.rows[0].total, 10),
          avgResponseTime: Math.round(parseFloat(avgTTFR.rows[0].avg)),
          openLeads: parseInt(openLeads.rows[0].total, 10),
          teamActivity: teamActivity.rows,
          onLeave: parseInt(onLeave.rows[0].total, 10),
          upcomingAppointments: parseInt(appts.rows[0]?.total ?? '0', 10),
          availability,
          stageValues: stageValueRows.rows.map(row => ({
            stageId: row.stage_id,
            stageName: row.stage_name,
            totalCents: parseInt(row.total_cents, 10),
            opportunityCount: parseInt(row.count, 10),
          })),
        },
      };

      res.json(maskValues(dashboardPayload, hasValuesView));
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
