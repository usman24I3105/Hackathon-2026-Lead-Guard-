import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { requireAuth, requirePermission, type AuthRequest } from '../auth';
import { writeAudit } from '../../domain/audit';
import { maskValues } from '../../security/masking';
import { appPool } from '../../db/pool';

export const crmRoutes = Router();
crmRoutes.use(requireAuth);

// ── Contacts ──────────────────────────────────────────────────────────────────
crmRoutes.get('/contacts', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, name, email, phone_e164, opted_out, company_id, created_at
         FROM contact WHERE workspace_id = $1 ORDER BY name LIMIT 200`,
        [r.workspaceId],
      );
      res.json({ contacts: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});

crmRoutes.post('/contacts', async (req, res, next) => {
  const r = req as AuthRequest;
  const schema = z.object({ name: z.string(), email: z.string().email().optional(), phone: z.string().optional(), companyId: z.string().optional() });
  try {
    const body = schema.strict().parse(req.body);
    await withTenant(r.workspaceId, async (client) => {
      const id = `con_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO contact (id, workspace_id, name, email, phone_e164, company_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, r.workspaceId, body.name, body.email ?? null, body.phone ?? null, body.companyId ?? null],
      );
      res.status(201).json({ id });
    });
  } catch (err) { next(err); }
});

// ── Companies ─────────────────────────────────────────────────────────────────
crmRoutes.get('/companies', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, name, domain, industry FROM company WHERE workspace_id = $1 ORDER BY name`,
        [r.workspaceId],
      );
      res.json({ companies: rows });
    });
  } catch (err) { next(err); }
});

// ── Opportunities ─────────────────────────────────────────────────────────────
const createOpportunitySchema = z.object({
  contactId: z.string(),
  pipelineId: z.string(),
  stageId: z.string(),
  name: z.string(),
  valueCents: z.number().int().min(0).default(0),
  companyId: z.string().optional(),
  custom: z.record(z.unknown()).optional(),
});

crmRoutes.get('/opportunities', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const hasValuesView = await checkPermission(r.userId, r.workspaceId, 'values.view');
      const { rows } = await client.query(
        `SELECT id, contact_id, stage_id, pipeline_id, name, value_cents, version, created_at
         FROM opportunity WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [r.workspaceId],
      );
      res.json({ opportunities: maskValues(rows, hasValuesView) });
    });
  } catch (err) { next(err); }
});

crmRoutes.post('/opportunities', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = createOpportunitySchema.strict().parse(req.body);
    await withTenant(r.workspaceId, async (client) => {
      const id = `opp_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO opportunity (id, workspace_id, contact_id, company_id, pipeline_id, stage_id, name, value_cents, custom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, r.workspaceId, body.contactId, body.companyId ?? null, body.pipelineId, body.stageId, body.name, body.valueCents, JSON.stringify(body.custom ?? {})],
      );
      await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'opportunity.created', entityType: 'opportunity', entityId: id, actor: 'user' });
      res.status(201).json({ id });
    });
  } catch (err) { next(err); }
});

crmRoutes.get('/opportunities/:id', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const hasValuesView = await checkPermission(r.userId, r.workspaceId, 'values.view');
      const { rows } = await client.query(
        `SELECT o.*, c.name AS contact_name, co.name AS company_name
         FROM opportunity o
         LEFT JOIN contact c ON c.id = o.contact_id
         LEFT JOIN company co ON co.id = o.company_id
         WHERE o.id = $1 AND o.workspace_id = $2`,
        [req.params['id'], r.workspaceId],
      );
      if (!rows[0]) return next(new AppError(404, 'not_found', 'Opportunity not found'));
      res.json(maskValues(rows[0], hasValuesView));
    });
  } catch (err) { next(err); }
});

// PATCH with If-Match
crmRoutes.patch('/opportunities/:id', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  const ifMatch = req.headers['if-match'];
  if (!ifMatch) return next(new AppError(428, 'precondition_required', 'If-Match header required'));
  const version = parseInt(ifMatch, 10);

  try {
    const schema = z.object({ stageId: z.string().optional(), name: z.string().optional(), valueCents: z.number().int().min(0).optional(), custom: z.record(z.unknown()).optional() });
    const body = schema.strict().parse(req.body);
    await withTenant(r.workspaceId, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE opportunity SET
           stage_id = COALESCE($1, stage_id),
           name = COALESCE($2, name),
           value_cents = COALESCE($3, value_cents),
           version = version + 1,
           updated_at = NOW()
         WHERE id = $4 AND workspace_id = $5 AND version = $6`,
        [body.stageId ?? null, body.name ?? null, body.valueCents ?? null, req.params['id'], r.workspaceId, version],
      );
      if (!rowCount || rowCount === 0) throw new AppError(409, 'version_conflict', 'Stale version');
      res.json({ ok: true });
    });
  } catch (err) { next(err); }
});

// Move opportunity to stage
crmRoutes.post('/opportunities/:id/move', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    const { stageId } = z.object({ stageId: z.string() }).strict().parse(req.body);
    await withTenant(r.workspaceId, async (client) => {
      // Validate required fields for target stage
      const { rows: stageRows } = await client.query<{ required_field_ids: string[] }>(
        `SELECT required_field_ids FROM stage WHERE id = $1 AND workspace_id = $2`,
        [stageId, r.workspaceId],
      );
      if (!stageRows[0]) throw new AppError(404, 'not_found', 'Stage not found');
      const { rows: oppRows } = await client.query<{ custom: Record<string, unknown>; version: number }>(
        `SELECT custom, version FROM opportunity WHERE id = $1 AND workspace_id = $2`,
        [req.params['id'], r.workspaceId],
      );
      if (!oppRows[0]) throw new AppError(404, 'not_found', 'Opportunity not found');
      const missing = (stageRows[0].required_field_ids ?? []).filter((fid) => !oppRows[0].custom?.[fid]);
      if (missing.length > 0) {
        throw new AppError(422, 'required_fields_missing', `Missing required fields: ${missing.join(', ')}`);
      }
      await client.query(
        `UPDATE opportunity SET stage_id = $1, version = version + 1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`,
        [stageId, req.params['id'], r.workspaceId],
      );
      res.json({ ok: true });
    });
  } catch (err) { next(err); }
});

// ── Pipelines ─────────────────────────────────────────────────────────────────
crmRoutes.get('/pipelines', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows: pipelines } = await client.query(
        `SELECT id, name, position FROM pipeline WHERE workspace_id = $1 ORDER BY position`,
        [r.workspaceId],
      );
      const { rows: stages } = await client.query(
        `SELECT id, pipeline_id, name, position, required_field_ids FROM stage WHERE workspace_id = $1 ORDER BY position`,
        [r.workspaceId],
      );
      res.json({ pipelines: pipelines.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) })) });
    });
  } catch (err) { next(err); }
});

// Delete stage — requires moveTo when non-empty
crmRoutes.delete('/stages/:id', requirePermission('crm.manage'), async (req, res, next) => {
  const r = req as AuthRequest;
  const moveTo = req.query['moveTo'] as string | undefined;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM opportunity WHERE stage_id = $1 AND workspace_id = $2`,
        [req.params['id'], r.workspaceId],
      );
      if (parseInt(rows[0].count) > 0 && !moveTo) {
        throw new AppError(409, 'stage_not_empty', 'Stage has opportunities. Provide moveTo parameter.');
      }
      if (moveTo) {
        await client.query(`UPDATE opportunity SET stage_id = $1 WHERE stage_id = $2 AND workspace_id = $3`, [moveTo, req.params['id'], r.workspaceId]);
      }
      await client.query(`DELETE FROM stage WHERE id = $1 AND workspace_id = $2`, [req.params['id'], r.workspaceId]);
      res.json({ ok: true });
    });
  } catch (err) { next(err); }
});

// ── 360 view ──────────────────────────────────────────────────────────────────
crmRoutes.get('/contacts/:id/360', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const hasValuesView = await checkPermission(r.userId, r.workspaceId, 'values.view');
      const [contactRes, oppsRes, leadsRes, messagesRes] = await Promise.all([
        client.query(`SELECT * FROM contact WHERE id = $1 AND workspace_id = $2`, [req.params['id'], r.workspaceId]),
        client.query(`SELECT id, name, stage_id, value_cents FROM opportunity WHERE contact_id = $1 AND workspace_id = $2`, [req.params['id'], r.workspaceId]),
        client.query(`SELECT id, state, created_at, escalation_count FROM lead WHERE contact_id = $1 AND workspace_id = $2`, [req.params['id'], r.workspaceId]),
        client.query(`SELECT id, direction, body, created_at FROM message WHERE contact_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 20`, [req.params['id'], r.workspaceId]),
      ]);
      if (!contactRes.rows[0]) return next(new AppError(404, 'not_found', 'Contact not found'));
      res.json(maskValues({
        contact: contactRes.rows[0],
        opportunities: oppsRes.rows,
        leads: leadsRes.rows,
        messages: messagesRes.rows,
      }, hasValuesView));
    });
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
