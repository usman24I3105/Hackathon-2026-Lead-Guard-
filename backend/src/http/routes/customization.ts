import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { requireAuth, requirePermission, type AuthRequest } from '../auth';
import { writeAudit } from '../../domain/audit';
import { hub } from '../../realtime/hub';
import {
  ENTITY_TYPES, FIELD_TYPES, applyCustomPatch, compileContactFilter, isFilled, loadFields,
  reorder, slugKey, writeContactEvent, writePositions, type EntityType, type FieldDef, type FieldType, type FilterGroup,
} from '../../domain/crm';

/**
 * Customizable CRM: custom fields, pipelines & stages, the single
 * move-opportunity service, saved lists, and contact history.
 * Every handler runs inside withTenant (RLS) AND filters by workspace_id.
 * Mounted before the legacy crm routes so these handlers take precedence.
 */
export const customizationRoutes = Router();
customizationRoutes.use(requireAuth);

const SETTINGS = 'crm.manage'; // "Manage settings"
const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

type Handler = (r: AuthRequest, client: PoolClient, res: Response) => Promise<unknown>;
/** Runs a handler in a tenant transaction attributed to the caller; JSON-encodes its return value. */
function tx(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const r = req as AuthRequest;
    try {
      const out = await withTenant(r.workspaceId, (client) => fn(r, client, res), r.userId);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) { next(err); }
  };
}

async function canViewValues(client: PoolClient, r: AuthRequest): Promise<boolean> {
  const { rows } = await client.query<{ role: string; permissions: string[] }>(
    `SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`, [r.userId, r.workspaceId]);
  return rows[0]?.role === 'owner' || rows[0]?.role === 'admin' || (rows[0]?.permissions ?? []).includes('values.view');
}

function versionFrom(req: Request, body: { version?: number }): number | undefined {
  const h = req.headers['if-match'];
  if (typeof h === 'string' && /^\d+$/.test(h.replace(/"/g, ''))) return Number(h.replace(/"/g, ''));
  return body.version;
}

const notify = (r: AuthRequest, event: string, data: Record<string, unknown> = {}) => hub.emit(r.workspaceId, event, data);

// ══ Custom fields ═════════════════════════════════════════════════════════════
const fieldShape = `f.id, f.entity_type, f.key, f.name AS label, f.type, f.options, f.help_text, f.required_default,
  f.must_be_true, f.position, f.archived_at, f.version, f.created_at, f.updated_at,
  COALESCE((SELECT array_agg(pf.pipeline_id) FROM pipeline_field pf WHERE pf.field_id = f.id AND pf.visible), '{}') AS pipeline_ids`;

customizationRoutes.get('/fields', tx(async (r, client) => {
  const entity = r.query['entity'];
  const archived = r.query['archived'] === 'true';
  const { rows } = await client.query(
    `SELECT ${fieldShape} FROM custom_field f
     WHERE f.workspace_id = $1 AND ($2::text IS NULL OR f.entity_type = $2) AND ($3 OR f.archived_at IS NULL)
     ORDER BY f.entity_type, f.position, f.created_at`,
    [r.workspaceId, typeof entity === 'string' ? entity : null, archived]);
  return { fields: rows };
}));

const optionsSchema = z.array(z.string().trim().min(1).max(80)).max(200);
const createFieldSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  label: z.string().trim().min(1, 'Label is required').max(100),
  key: z.string().regex(/^[a-z0-9_]{1,60}$/).optional(),
  type: z.enum(FIELD_TYPES),
  options: optionsSchema.optional(),
  helpText: z.string().max(300).optional(),
  requiredDefault: z.boolean().optional(),
  mustBeTrue: z.boolean().optional(),
  pipelineIds: z.array(z.string()).optional(),
}).strict();

function checkOptions(type: FieldType, options: string[] | undefined) {
  if ((type === 'select' || type === 'multi_select') && !(options && options.length >= 1)) {
    throw new AppError(422, 'validation_failed', 'A select field needs at least one option', { field: 'options' });
  }
  if (options && new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    throw new AppError(422, 'validation_failed', 'Options must be unique', { field: 'options' });
  }
}

customizationRoutes.post('/fields', requirePermission(SETTINGS), tx(async (r, client, res) => {
  const body = createFieldSchema.parse(r.body);
  checkOptions(body.type, body.options);
  const key = body.key ?? slugKey(body.label);
  const dupe = await client.query(`SELECT 1 FROM custom_field WHERE workspace_id = $1 AND entity_type = $2 AND key = $3`, [r.workspaceId, body.entityType, key]);
  if (dupe.rowCount) throw new AppError(409, 'duplicate_key', `A ${body.entityType} field with key "${key}" already exists`, { field: 'key' });
  const id = newId('fld');
  const { rows: pos } = await client.query<{ n: number }>(
    `SELECT COALESCE(MAX(position) + 1, 0) AS n FROM custom_field WHERE workspace_id = $1 AND entity_type = $2`, [r.workspaceId, body.entityType]);
  await client.query(
    `INSERT INTO custom_field (id, workspace_id, entity_type, key, name, type, options, help_text, required_default, must_be_true, position, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, r.workspaceId, body.entityType, key, body.label, body.type, JSON.stringify(body.options ?? []), body.helpText ?? null,
      body.requiredDefault ?? false, body.mustBeTrue ?? false, pos[0].n, r.userId]);
  if (body.entityType === 'opportunity') {
    // New opportunity fields show in the chosen pipelines (default: all of them).
    await client.query(
      `INSERT INTO pipeline_field (workspace_id, pipeline_id, field_id, position)
       SELECT $1, p.id, $2, 1000 FROM pipeline p WHERE p.workspace_id = $1 AND ($3::text[] IS NULL OR p.id = ANY($3))`,
      [r.workspaceId, id, body.pipelineIds ?? null]);
  }
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'field.created', entityType: 'custom_field', entityId: id, actor: 'user', after: body });
  notify(r, 'fields.changed', { id });
  const { rows } = await client.query(`SELECT ${fieldShape} FROM custom_field f WHERE f.id = $1`, [id]);
  res.status(201);
  return rows[0];
}));

const patchFieldSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(100).optional(),
  type: z.enum(FIELD_TYPES).optional(),
  options: optionsSchema.optional(),
  helpText: z.string().max(300).nullable().optional(),
  requiredDefault: z.boolean().optional(),
  mustBeTrue: z.boolean().optional(),
  version: z.number().int().optional(),
}).strict();

const tableFor = (entity: string) => (entity === 'contact' ? 'contact' : entity === 'company' ? 'company' : 'opportunity');

customizationRoutes.patch('/fields/:id', requirePermission(SETTINGS), tx(async (r, client) => {
  const body = patchFieldSchema.parse(r.body);
  const { rows } = await client.query(`SELECT * FROM custom_field WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [r.params['id'], r.workspaceId]);
  const field = rows[0];
  if (!field) throw new AppError(404, 'not_found', 'Field not found');
  const version = versionFrom(r, body);
  if (version !== undefined && version !== field.version) throw new AppError(409, 'version_conflict', 'Someone else changed this field. Reload to see their changes.');
  if (body.type && body.type !== field.type) {
    const used = await client.query(`SELECT 1 FROM ${tableFor(field.entity_type)} WHERE workspace_id = $1 AND custom ? $2 LIMIT 1`, [r.workspaceId, field.id]);
    if (used.rowCount) throw new AppError(422, 'type_locked', 'The type cannot change once records have values for this field', { field: 'type' });
  }
  const type = body.type ?? field.type;
  if (body.options || body.type) checkOptions(type, body.options ?? field.options ?? []);
  await client.query(
    `UPDATE custom_field SET name = COALESCE($3, name), type = $4, options = COALESCE($5, options),
       help_text = CASE WHEN $6 THEN $7 ELSE help_text END, required_default = COALESCE($8, required_default),
       must_be_true = COALESCE($9, must_be_true), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2`,
    [field.id, r.workspaceId, body.label ?? null, type, body.options ? JSON.stringify(body.options) : null,
      body.helpText !== undefined, body.helpText ?? null, body.requiredDefault ?? null, body.mustBeTrue ?? null]);
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'field.updated', entityType: 'custom_field', entityId: field.id, actor: 'user', before: { label: field.name }, after: body });
  notify(r, 'fields.changed', { id: field.id });
  const { rows: out } = await client.query(`SELECT ${fieldShape} FROM custom_field f WHERE f.id = $1`, [field.id]);
  return out[0];
}));

customizationRoutes.post('/fields/:id/:action(archive|restore)', requirePermission(SETTINGS), tx(async (r, client) => {
  const archive = r.params['action'] === 'archive';
  const { rowCount } = await client.query(
    `UPDATE custom_field SET archived_at = ${archive ? 'NOW()' : 'NULL'}, version = version + 1, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
    [r.params['id'], r.workspaceId]);
  if (!rowCount) throw new AppError(404, 'not_found', 'Field not found');
  if (archive) {
    // Archived fields stop being stage requirements; their values are kept.
    await client.query(`UPDATE stage SET required_field_ids = array_remove(required_field_ids, $1) WHERE workspace_id = $2`, [r.params['id'], r.workspaceId]);
  }
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: archive ? 'field.archived' : 'field.restored', entityType: 'custom_field', entityId: String(r.params['id']), actor: 'user' });
  notify(r, 'fields.changed', { id: r.params['id'] });
  notify(r, 'pipelines.changed');
}));

customizationRoutes.delete('/fields/:id', requirePermission(SETTINGS), (_req, _res, next) => {
  next(new AppError(405, 'method_not_allowed', 'Fields are archived, never deleted. POST /api/crm/fields/:id/archive'));
});

customizationRoutes.post('/fields/:id/reorder', requirePermission(SETTINGS), tx(async (r, client) => {
  const { targetIndex } = z.object({ targetIndex: z.number().int().min(0) }).strict().parse(r.body);
  const { rows } = await client.query<{ entity_type: string }>(`SELECT entity_type FROM custom_field WHERE id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Field not found');
  const { rows: all } = await client.query<{ id: string }>(
    `SELECT id FROM custom_field WHERE workspace_id = $1 AND entity_type = $2 AND archived_at IS NULL ORDER BY position, created_at FOR UPDATE`,
    [r.workspaceId, rows[0].entity_type]);
  await writePositions(client, 'custom_field', r.workspaceId, reorder(all.map((x) => x.id), String(r.params['id']), targetIndex));
  notify(r, 'fields.changed');
}));

// ══ Pipelines & stages ════════════════════════════════════════════════════════
async function pipelinesPayload(client: PoolClient, ws: string) {
  const { rows: pipelines } = await client.query(
    `SELECT id, name, entity_type, position, archived_at FROM pipeline WHERE workspace_id = $1 AND archived_at IS NULL ORDER BY position, created_at`, [ws]);
  const { rows: stages } = await client.query(
    `SELECT s.id, s.pipeline_id, s.name, s.position, s.type, s.color, s.required_field_ids, s.version,
       (SELECT COUNT(*)::int FROM opportunity o WHERE o.stage_id = s.id AND o.workspace_id = s.workspace_id) AS opportunity_count
     FROM stage s WHERE s.workspace_id = $1 ORDER BY s.position, s.created_at`, [ws]);
  const { rows: links } = await client.query(
    `SELECT pf.pipeline_id, pf.field_id, pf.visible, pf.position FROM pipeline_field pf
     JOIN custom_field f ON f.id = pf.field_id AND f.archived_at IS NULL
     WHERE pf.workspace_id = $1 AND pf.visible ORDER BY pf.position, f.position`, [ws]);
  return {
    pipelines: pipelines.map((p) => ({
      ...p,
      stages: stages.filter((s) => s.pipeline_id === p.id),
      field_ids: links.filter((l) => l.pipeline_id === p.id).map((l) => l.field_id),
    })),
  };
}

customizationRoutes.get('/pipelines', tx(async (r, client) => pipelinesPayload(client, r.workspaceId)));

customizationRoutes.post('/pipelines', requirePermission(SETTINGS), tx(async (r, client, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(100) }).strict().parse(r.body);
  const id = newId('pip');
  await client.query(
    `INSERT INTO pipeline (id, workspace_id, name, position) SELECT $1, $2, $3, COALESCE(MAX(position) + 1, 0) FROM pipeline WHERE workspace_id = $2`,
    [id, r.workspaceId, body.name]);
  // A pipeline always has somewhere open to put work, plus won/lost outcomes.
  for (const [i, [name, type]] of ([['New', 'open'], ['Won', 'won'], ['Lost', 'lost']] as const).entries()) {
    await client.query(`INSERT INTO stage (id, workspace_id, pipeline_id, name, position, type) VALUES ($1,$2,$3,$4,$5,$6)`,
      [newId('stg'), r.workspaceId, id, name, i, type]);
  }
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'pipeline.created', entityType: 'pipeline', entityId: id, actor: 'user', after: body });
  notify(r, 'pipelines.changed');
  res.status(201);
  return { id };
}));

customizationRoutes.patch('/pipelines/:id', requirePermission(SETTINGS), tx(async (r, client) => {
  const body = z.object({ name: z.string().trim().min(1).max(100) }).strict().parse(r.body);
  const { rowCount } = await client.query(`UPDATE pipeline SET name = $3 WHERE id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId, body.name]);
  if (!rowCount) throw new AppError(404, 'not_found', 'Pipeline not found');
  notify(r, 'pipelines.changed');
}));

customizationRoutes.put('/pipelines/:id/fields', requirePermission(SETTINGS), tx(async (r, client) => {
  const { fieldIds } = z.object({ fieldIds: z.array(z.string()).max(200) }).strict().parse(r.body);
  const pipe = await client.query(`SELECT 1 FROM pipeline WHERE id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId]);
  if (!pipe.rowCount) throw new AppError(404, 'not_found', 'Pipeline not found');
  const valid = await client.query<{ id: string }>(
    `SELECT id FROM custom_field WHERE workspace_id = $1 AND entity_type = 'opportunity' AND id = ANY($2)`, [r.workspaceId, fieldIds]);
  if (valid.rowCount !== new Set(fieldIds).size) throw new AppError(422, 'validation_failed', 'Unknown opportunity field');
  await client.query(`DELETE FROM pipeline_field WHERE pipeline_id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId]);
  await client.query(
    `INSERT INTO pipeline_field (workspace_id, pipeline_id, field_id, position)
     SELECT $1, $2, f.id, o.pos FROM unnest($3::text[]) WITH ORDINALITY AS o(id, pos) JOIN custom_field f ON f.id = o.id`,
    [r.workspaceId, r.params['id'], fieldIds]);
  // A stage can only require fields its pipeline shows.
  await client.query(
    `UPDATE stage SET required_field_ids = ARRAY(SELECT x FROM unnest(required_field_ids) x WHERE x = ANY($3)) WHERE pipeline_id = $1 AND workspace_id = $2`,
    [r.params['id'], r.workspaceId, fieldIds]);
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'pipeline.fields_updated', entityType: 'pipeline', entityId: String(r.params['id']), actor: 'user', after: { fieldIds } });
  notify(r, 'pipelines.changed');
}));

const STAGE_TYPES = ['open', 'won', 'lost'] as const;
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

customizationRoutes.post('/stages', requirePermission(SETTINGS), tx(async (r, client, res) => {
  const body = z.object({
    pipelineId: z.string(), name: z.string().trim().min(1).max(100),
    type: z.enum(STAGE_TYPES).default('open'), color: colorSchema.optional(),
    requiredFieldIds: z.array(z.string()).default([]), position: z.number().int().optional(),
  }).strict().parse(r.body);
  const pipe = await client.query(`SELECT 1 FROM pipeline WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [body.pipelineId, r.workspaceId]);
  if (!pipe.rowCount) throw new AppError(404, 'not_found', 'Pipeline not found');
  await assertRequirable(client, r.workspaceId, body.pipelineId, body.requiredFieldIds);
  const id = newId('stg');
  const { rows: ordered } = await client.query<{ id: string }>(`SELECT id FROM stage WHERE pipeline_id = $1 AND workspace_id = $2 ORDER BY position, created_at`, [body.pipelineId, r.workspaceId]);
  await client.query(`INSERT INTO stage (id, workspace_id, pipeline_id, name, position, type, color, required_field_ids) VALUES ($1,$2,$3,$4,0,$5,$6,$7)`,
    [id, r.workspaceId, body.pipelineId, body.name, body.type, body.color ?? null, body.requiredFieldIds]);
  // Default: before the first won/lost stage, so new work stages sit with the open ones.
  const ids = ordered.map((s) => s.id);
  const { rows: types } = await client.query<{ id: string; type: string }>(`SELECT id, type FROM stage WHERE id = ANY($1)`, [ids]);
  const firstClosed = ids.findIndex((sid) => types.find((t) => t.id === sid)?.type !== 'open');
  const at = body.position ?? (body.type === 'open' && firstClosed >= 0 ? firstClosed : ids.length);
  await writePositions(client, 'stage', r.workspaceId, reorder([...ids, id], id, at));
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'stage.created', entityType: 'stage', entityId: id, actor: 'user', after: body });
  notify(r, 'pipelines.changed');
  res.status(201);
  return { id };
}));

async function assertRequirable(client: PoolClient, ws: string, pipelineId: string, fieldIds: string[]) {
  if (!fieldIds.length) return;
  const { rows } = await client.query<{ id: string }>(
    `SELECT f.id FROM custom_field f JOIN pipeline_field pf ON pf.field_id = f.id AND pf.pipeline_id = $2
     WHERE f.workspace_id = $1 AND f.archived_at IS NULL AND f.id = ANY($3)`, [ws, pipelineId, fieldIds]);
  if (rows.length !== new Set(fieldIds).size) {
    throw new AppError(422, 'validation_failed', 'Required fields must be active fields shown in this pipeline');
  }
}

const updateStage = tx(async (r, client) => {
  const body = z.object({
    name: z.string().trim().min(1).max(100).optional(), type: z.enum(STAGE_TYPES).optional(), color: colorSchema.optional(),
    requiredFieldIds: z.array(z.string()).optional(), version: z.number().int().optional(),
  }).strict().parse(r.body);
  const { rows } = await client.query(`SELECT * FROM stage WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [r.params['id'], r.workspaceId]);
  const stage = rows[0];
  if (!stage) throw new AppError(404, 'not_found', 'Stage not found');
  const version = versionFrom(r, body);
  if (version !== undefined && version !== stage.version) {
    throw new AppError(409, 'version_conflict', 'Another admin changed this stage. Reload to see their changes.', { current: stage });
  }
  if (body.type && body.type !== 'open' && stage.type === 'open') await assertAnotherOpenStage(client, r.workspaceId, stage.pipeline_id, stage.id);
  if (body.requiredFieldIds) await assertRequirable(client, r.workspaceId, stage.pipeline_id, body.requiredFieldIds);
  await client.query(
    `UPDATE stage SET name = COALESCE($3, name), type = COALESCE($4, type), color = CASE WHEN $5 THEN $6 ELSE color END,
       required_field_ids = COALESCE($7, required_field_ids), version = version + 1 WHERE id = $1 AND workspace_id = $2`,
    [stage.id, r.workspaceId, body.name ?? null, body.type ?? null, body.color !== undefined, body.color ?? null, body.requiredFieldIds ?? null]);
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'stage.updated', entityType: 'stage', entityId: stage.id, actor: 'user', before: { name: stage.name }, after: body });
  notify(r, 'pipelines.changed');
  return { ok: true, version: stage.version + 1 };
});
customizationRoutes.patch('/stages/:id', requirePermission(SETTINGS), updateStage);
// Legacy PUT kept for older clients — same rules.
customizationRoutes.put('/stages/:id', requirePermission(SETTINGS), updateStage);

async function assertAnotherOpenStage(client: PoolClient, ws: string, pipelineId: string, exceptId: string) {
  const { rows } = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM stage WHERE pipeline_id = $1 AND workspace_id = $2 AND type = 'open' AND id <> $3`, [pipelineId, ws, exceptId]);
  if (rows[0].n === 0) throw new AppError(409, 'last_open_stage', 'A pipeline needs at least one open stage');
}

customizationRoutes.post('/stages/:id/reorder', requirePermission(SETTINGS), tx(async (r, client) => {
  const { targetIndex } = z.object({ targetIndex: z.number().int().min(0) }).strict().parse(r.body);
  const { rows } = await client.query<{ pipeline_id: string }>(`SELECT pipeline_id FROM stage WHERE id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Stage not found');
  // Serialise concurrent reorders of the same pipeline, then write compact 0..n-1 positions.
  await client.query(`SELECT 1 FROM pipeline WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [rows[0].pipeline_id, r.workspaceId]);
  const { rows: all } = await client.query<{ id: string }>(
    `SELECT id FROM stage WHERE pipeline_id = $1 AND workspace_id = $2 ORDER BY position, created_at`, [rows[0].pipeline_id, r.workspaceId]);
  const order = reorder(all.map((s) => s.id), String(r.params['id']), targetIndex);
  await writePositions(client, 'stage', r.workspaceId, order);
  await client.query(`UPDATE stage SET version = version + 1 WHERE pipeline_id = $1 AND workspace_id = $2`, [rows[0].pipeline_id, r.workspaceId]);
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'stage.reordered', entityType: 'stage', entityId: String(r.params['id']), actor: 'user', after: { order } });
  notify(r, 'pipelines.changed');
  return { order };
}));

customizationRoutes.delete('/stages/:id', requirePermission(SETTINGS), tx(async (r, client) => {
  const moveTo = typeof r.query['moveTo'] === 'string' ? r.query['moveTo'] : undefined;
  const { rows } = await client.query(`SELECT * FROM stage WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [r.params['id'], r.workspaceId]);
  const stage = rows[0];
  if (!stage) throw new AppError(404, 'not_found', 'Stage not found');
  if (stage.type === 'open') await assertAnotherOpenStage(client, r.workspaceId, stage.pipeline_id, stage.id);
  const { rows: count } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM opportunity WHERE stage_id = $1 AND workspace_id = $2`, [stage.id, r.workspaceId]);
  if (count[0].n > 0) {
    if (!moveTo) throw new AppError(409, 'stage_not_empty', `${count[0].n} opportunities are in this stage. Choose a stage to move them to.`, { count: count[0].n });
    const dest = await client.query(`SELECT 1 FROM stage WHERE id = $1 AND pipeline_id = $2 AND workspace_id = $3 AND id <> $4`, [moveTo, stage.pipeline_id, r.workspaceId, stage.id]);
    if (!dest.rowCount) throw new AppError(422, 'validation_failed', 'Destination must be another stage in the same pipeline');
    const { rows: moved } = await client.query<{ id: string; contact_id: string }>(
      `UPDATE opportunity SET stage_id = $1, version = version + 1, updated_at = NOW() WHERE stage_id = $2 AND workspace_id = $3 RETURNING id, contact_id`,
      [moveTo, stage.id, r.workspaceId]);
    const { rows: destName } = await client.query<{ name: string }>(`SELECT name FROM stage WHERE id = $1`, [moveTo]);
    for (const o of moved) {
      await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: o.contact_id, opportunityId: o.id, type: 'opportunity.stage_changed', actorId: r.userId,
        payload: { from_stage_id: stage.id, from_stage_name: stage.name, to_stage_id: moveTo, to_stage_name: destName[0]?.name, reason: 'stage_deleted' } });
    }
  }
  await client.query(`DELETE FROM stage WHERE id = $1 AND workspace_id = $2`, [stage.id, r.workspaceId]);
  const { rows: rest } = await client.query<{ id: string }>(`SELECT id FROM stage WHERE pipeline_id = $1 AND workspace_id = $2 ORDER BY position`, [stage.pipeline_id, r.workspaceId]);
  await writePositions(client, 'stage', r.workspaceId, rest.map((s) => s.id));
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'stage.deleted', entityType: 'stage', entityId: stage.id, actor: 'user', before: { name: stage.name }, after: { moveTo } });
  notify(r, 'pipelines.changed');
  notify(r, 'opportunities.changed');
}));

// ══ Opportunities ═════════════════════════════════════════════════════════════
const oppSelect = `o.id, o.contact_id, o.company_id, o.pipeline_id, o.stage_id, o.name, o.value_cents, o.custom, o.version, o.created_at, o.updated_at,
  ARRAY(SELECT fid FROM unnest(s.required_field_ids) fid WHERE NOT (o.custom ? fid)) AS missing_required`;

function maskOpp<T extends { value_cents: unknown }>(row: T, canView: boolean): T {
  return canView ? row : { ...row, value_cents: null, value_restricted: true };
}

customizationRoutes.get('/opportunities', tx(async (r, client) => {
  const canView = await canViewValues(client, r);
  const { rows } = await client.query(
    `SELECT ${oppSelect} FROM opportunity o JOIN stage s ON s.id = o.stage_id WHERE o.workspace_id = $1 ORDER BY o.created_at DESC LIMIT 1000`, [r.workspaceId]);
  return { opportunities: rows.map((o) => maskOpp(o, canView)) };
}));

customizationRoutes.post('/opportunities', tx(async (r, client, res) => {
  const body = z.object({
    contactId: z.string(), pipelineId: z.string(), stageId: z.string(), name: z.string().trim().min(1).max(200),
    valueCents: z.number().int().min(0).nullable().default(0), companyId: z.string().optional(), custom: z.record(z.unknown()).optional(),
  }).strict().parse(r.body);
  const { rows: st } = await client.query(`SELECT id, name, type, required_field_ids FROM stage WHERE id = $1 AND pipeline_id = $2 AND workspace_id = $3`, [body.stageId, body.pipelineId, r.workspaceId]);
  if (!st[0]) throw new AppError(422, 'validation_failed', 'Stage does not belong to that pipeline');
  const contact = await client.query(`SELECT 1 FROM contact WHERE id = $1 AND workspace_id = $2`, [body.contactId, r.workspaceId]);
  if (!contact.rowCount) throw new AppError(404, 'not_found', 'Contact not found');
  const fields = await pipelineFields(client, r.workspaceId, body.pipelineId);
  const { next } = applyCustomPatch(fields, {}, body.custom ?? {});
  const missing = missingFor(st[0].required_field_ids, fields, next);
  if (missing.length) return stageBlocked(res, st[0].name, missing);
  const id = newId('opp');
  await client.query(
    `INSERT INTO opportunity (id, workspace_id, contact_id, company_id, pipeline_id, stage_id, name, value_cents, custom) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, r.workspaceId, body.contactId, body.companyId ?? null, body.pipelineId, body.stageId, body.name, body.valueCents ?? 0, JSON.stringify(next)]);
  await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: body.contactId, opportunityId: id, type: 'opportunity.created', actorId: r.userId,
    payload: { name: body.name, stage_id: body.stageId, stage_name: st[0].name }, sourceRef: `opportunity:${id}` });
  await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'opportunity.created', entityType: 'opportunity', entityId: id, actor: 'user' });
  notify(r, 'opportunities.changed', { id, contactId: body.contactId });
  res.status(201);
  return { id };
}));

async function pipelineFields(client: PoolClient, ws: string, pipelineId: string): Promise<FieldDef[]> {
  const { rows } = await client.query<FieldDef>(
    `SELECT f.id, f.name AS label, f.type, f.options, f.must_be_true FROM custom_field f
     JOIN pipeline_field pf ON pf.field_id = f.id AND pf.pipeline_id = $2 AND pf.visible
     WHERE f.workspace_id = $1 AND f.archived_at IS NULL ORDER BY pf.position, f.position`, [ws, pipelineId]);
  return rows;
}

function missingFor(required: string[], fields: FieldDef[], values: Record<string, unknown>) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  return (required ?? [])
    .map((id) => byId.get(id))
    .filter((f): f is FieldDef => !!f && !isFilled(values[f.id], f))
    .map((f) => ({ field_id: f.id, label: f.label, type: f.type, options: f.options, must_be_true: f.must_be_true }));
}

function stageBlocked(res: Response, stageName: string, missing: ReturnType<typeof missingFor>) {
  const message = `Fill required fields to move to ${stageName}`;
  res.status(422).json({ code: 'STAGE_REQUIRED_FIELDS_MISSING', message, missing, error: { code: 'STAGE_REQUIRED_FIELDS_MISSING', message, details: { missing } } });
  return undefined;
}

customizationRoutes.patch('/opportunities/:id', tx(async (r, client) => {
  const body = z.object({
    name: z.string().trim().min(1).max(200).optional(), valueCents: z.number().int().min(0).nullable().optional(),
    custom: z.record(z.unknown()).optional(), version: z.number().int().optional(),
  }).strict().parse(r.body); // stageId is deliberately NOT accepted: stage changes go through /move
  const { rows } = await client.query(`SELECT * FROM opportunity WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [r.params['id'], r.workspaceId]);
  const opp = rows[0];
  if (!opp) throw new AppError(404, 'not_found', 'Opportunity not found');
  const version = versionFrom(r, body);
  if (version !== undefined && version !== opp.version) throw new AppError(409, 'version_conflict', 'This opportunity changed since you opened it. Reload and try again.');
  const fields = await pipelineFields(client, r.workspaceId, opp.pipeline_id);
  const { next, diff } = applyCustomPatch(fields, opp.custom ?? {}, body.custom ?? {});
  const changes: { field: string; before: unknown; after: unknown }[] = [];
  if (body.name !== undefined && body.name !== opp.name) changes.push({ field: 'Name', before: opp.name, after: body.name });
  if (body.valueCents !== undefined && Number(body.valueCents) !== Number(opp.value_cents)) changes.push({ field: 'Value', before: opp.value_cents, after: body.valueCents });
  await client.query(
    `UPDATE opportunity SET name = COALESCE($3, name), value_cents = COALESCE($4, value_cents), custom = $5, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2`,
    [opp.id, r.workspaceId, body.name ?? null, body.valueCents ?? null, JSON.stringify(next)]);
  if (diff.length || changes.length) {
    await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: opp.contact_id, opportunityId: opp.id, type: 'opportunity.updated', actorId: r.userId,
      payload: { name: body.name ?? opp.name, changes: [...changes.map((c) => ({ label: c.field, before: c.before, after: c.after, money: c.field === 'Value' })), ...diff] } });
  }
  notify(r, 'opportunities.changed', { id: opp.id, contactId: opp.contact_id });
  return { ok: true, version: opp.version + 1 };
}));

/**
 * THE move-opportunity service. Board drag, detail dropdown, bulk move, the
 * fill-fields dialog and the API all call this. Required fields are checked
 * against the TARGET stage only, after merging any values sent with the move;
 * on failure nothing is written. On success the stage change, the field values
 * and the history event commit in one transaction.
 */
export async function moveOpportunity(
  client: PoolClient, r: { workspaceId: string; userId: string },
  oppId: string, stageId: string, values: Record<string, unknown> = {},
): Promise<{ ok: true; version: number } | { ok: false; stageName: string; missing: ReturnType<typeof missingFor> }> {
  const { rows } = await client.query(`SELECT * FROM opportunity WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [oppId, r.workspaceId]);
  const opp = rows[0];
  if (!opp) throw new AppError(404, 'not_found', 'Opportunity not found');
  const { rows: st } = await client.query(`SELECT id, pipeline_id, name, type, required_field_ids FROM stage WHERE id = $1 AND workspace_id = $2`, [stageId, r.workspaceId]);
  const target = st[0];
  if (!target) throw new AppError(404, 'not_found', 'Stage not found');
  if (target.pipeline_id !== opp.pipeline_id) {
    throw new AppError(422, 'CROSS_PIPELINE_MOVE', 'Opportunities cannot move between pipelines. Create a new opportunity in the other pipeline instead.');
  }
  const fields = await pipelineFields(client, r.workspaceId, opp.pipeline_id);
  const { next, diff } = applyCustomPatch(fields, opp.custom ?? {}, values);
  const missing = missingFor(target.required_field_ids, fields, next);
  if (missing.length) return { ok: false, stageName: target.name, missing };
  if (target.id === opp.stage_id && !diff.length) return { ok: true, version: opp.version };
  const { rows: from } = await client.query<{ name: string }>(`SELECT name FROM stage WHERE id = $1`, [opp.stage_id]);
  await client.query(`UPDATE opportunity SET stage_id = $3, custom = $4, version = version + 1, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
    [opp.id, r.workspaceId, target.id, JSON.stringify(next)]);
  if (diff.length) {
    await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: opp.contact_id, opportunityId: opp.id, type: 'opportunity.updated', actorId: r.userId,
      payload: { name: opp.name, changes: diff, during_move_to: target.name } });
  }
  if (target.id !== opp.stage_id) {
    // Stage names are snapshotted so later renames never rewrite history.
    await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: opp.contact_id, opportunityId: opp.id, type: 'opportunity.stage_changed', actorId: r.userId,
      payload: { name: opp.name, from_stage_id: opp.stage_id, from_stage_name: from[0]?.name ?? null, to_stage_id: target.id, to_stage_name: target.name, fields_changed: diff } });
    await writeAudit(client as never, { workspaceId: r.workspaceId, userId: r.userId, type: 'opportunity.moved', entityType: 'opportunity', entityId: opp.id, actor: 'user',
      before: { stage: from[0]?.name }, after: { stage: target.name } });
  }
  hub.emit(r.workspaceId, 'opportunities.changed', { id: opp.id, contactId: opp.contact_id });
  return { ok: true, version: opp.version + 1 };
}

const moveSchema = z.object({ stageId: z.string(), fields: z.record(z.unknown()).optional() }).strict();

customizationRoutes.post('/opportunities/:id/move', tx(async (r, client, res) => {
  const body = moveSchema.parse(r.body);
  const out = await moveOpportunity(client, r, String(r.params['id']), body.stageId, body.fields);
  if (!out.ok) return stageBlocked(res, out.stageName, out.missing);
  return out;
}));

customizationRoutes.post('/opportunities/bulk-move', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = z.object({ ids: z.array(z.string()).min(1).max(500), stageId: z.string() }).strict().parse(req.body);
    const results: { id: string; ok: boolean; code?: string; message?: string; missing?: unknown[] }[] = [];
    // One transaction per record: a blocked record never rolls back the others.
    for (const id of body.ids) {
      try {
        const out = await withTenant(r.workspaceId, (client) => moveOpportunity(client, r, id, body.stageId), r.userId);
        results.push(out.ok ? { id, ok: true } : { id, ok: false, code: 'STAGE_REQUIRED_FIELDS_MISSING', message: `Fill required fields to move to ${out.stageName}`, missing: out.missing });
      } catch (err) {
        results.push({ id, ok: false, code: err instanceof AppError ? err.code : 'error', message: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results, moved: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length });
  } catch (err) { next(err); }
});

// ══ Contacts & companies ══════════════════════════════════════════════════════
const contactSelect = `c.id, c.name, c.email, c.phone_e164, c.opted_out, c.company_id, c.owner_id, c.source, c.custom, c.version,
  c.created_at, c.updated_at, c.last_activity_at`;

customizationRoutes.get('/contacts', tx(async (r, client) => {
  const { rows } = await client.query(`SELECT ${contactSelect} FROM contact c WHERE c.workspace_id = $1 ORDER BY c.name LIMIT 1000`, [r.workspaceId]);
  return { contacts: rows, total: rows.length };
}));

customizationRoutes.get('/contacts/:id', tx(async (r, client) => {
  const { rows } = await client.query(`SELECT ${contactSelect} FROM contact c WHERE c.id = $1 AND c.workspace_id = $2`, [r.params['id'], r.workspaceId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Contact not found');
  return rows[0];
}));

const contactBody = {
  name: z.string().trim().min(1).max(200), email: z.string().email().nullable(), phone: z.string().max(40).nullable(),
  companyId: z.string().nullable(), ownerId: z.string().nullable(), source: z.string().max(60).nullable(),
  optedOut: z.boolean(), custom: z.record(z.unknown()),
};

async function assertMember(client: PoolClient, ws: string, userId: string | null | undefined) {
  if (!userId) return;
  const ok = await client.query(`SELECT 1 FROM "user" WHERE id = $1 AND workspace_id = $2`, [userId, ws]);
  if (!ok.rowCount) throw new AppError(422, 'validation_failed', 'Owner must be a member of this workspace');
}

customizationRoutes.post('/contacts', tx(async (r, client, res) => {
  const body = z.object({ ...contactBody, email: contactBody.email.optional(), phone: contactBody.phone.optional(), companyId: contactBody.companyId.optional(),
    ownerId: contactBody.ownerId.optional(), source: contactBody.source.optional(), optedOut: contactBody.optedOut.optional(), custom: contactBody.custom.optional() }).strict().parse(r.body);
  await assertMember(client, r.workspaceId, body.ownerId);
  const fields = await loadFields(client, r.workspaceId, 'contact');
  const { next } = applyCustomPatch(fields, {}, body.custom ?? {});
  const id = newId('con');
  await client.query(
    `INSERT INTO contact (id, workspace_id, name, email, phone_e164, company_id, owner_id, source, custom, last_activity_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
    [id, r.workspaceId, body.name, body.email ?? null, body.phone ?? null, body.companyId ?? null, body.ownerId ?? r.userId, body.source ?? 'manual', JSON.stringify(next)]);
  await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: id, type: 'contact.created', actorId: r.userId, payload: { name: body.name }, sourceRef: `contact:${id}` });
  notify(r, 'contacts.changed', { id });
  res.status(201);
  return { id };
}));

customizationRoutes.patch('/contacts/:id', tx(async (r, client) => {
  const body = z.object({
    name: contactBody.name.optional(), email: contactBody.email.optional(), phone: contactBody.phone.optional(),
    companyId: contactBody.companyId.optional(), ownerId: contactBody.ownerId.optional(), source: contactBody.source.optional(),
    optedOut: contactBody.optedOut.optional(), custom: contactBody.custom.optional(), version: z.number().int().optional(),
  }).strict().parse(r.body);
  const { rows } = await client.query(`SELECT * FROM contact WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [r.params['id'], r.workspaceId]);
  const c = rows[0];
  if (!c) throw new AppError(404, 'not_found', 'Contact not found');
  const version = versionFrom(r, body);
  if (version !== undefined && version !== c.version) throw new AppError(409, 'version_conflict', 'This contact changed since you opened it. Reload and try again.');
  await assertMember(client, r.workspaceId, body.ownerId);
  const fields = await loadFields(client, r.workspaceId, 'contact');
  const { next, diff } = applyCustomPatch(fields, c.custom ?? {}, body.custom ?? {});
  const builtins: [string, string, unknown, unknown][] = [
    ['name', 'Name', c.name, body.name], ['email', 'Email', c.email, body.email], ['phone_e164', 'Phone', c.phone_e164, body.phone],
    ['source', 'Source', c.source, body.source], ['company_id', 'Company', c.company_id, body.companyId],
  ];
  const changes = builtins.filter(([, , before, after]) => after !== undefined && after !== before)
    .map(([, label, before, after]) => ({ label, before, after }));
  await client.query(
    `UPDATE contact SET name = COALESCE($3, name), email = CASE WHEN $4 THEN $5 ELSE email END, phone_e164 = CASE WHEN $6 THEN $7 ELSE phone_e164 END,
       company_id = CASE WHEN $8 THEN $9 ELSE company_id END, owner_id = CASE WHEN $10 THEN $11 ELSE owner_id END,
       source = CASE WHEN $12 THEN $13 ELSE source END, opted_out = COALESCE($14, opted_out), custom = $15,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2`,
    [c.id, r.workspaceId, body.name ?? null, body.email !== undefined, body.email ?? null, body.phone !== undefined, body.phone ?? null,
      body.companyId !== undefined, body.companyId ?? null, body.ownerId !== undefined, body.ownerId ?? null,
      body.source !== undefined, body.source ?? null, body.optedOut ?? null, JSON.stringify(next)]);
  if (changes.length || diff.length) {
    await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: c.id, type: 'contact.updated', actorId: r.userId, payload: { changes: [...changes, ...diff] } });
  }
  if (body.ownerId !== undefined && body.ownerId !== c.owner_id) {
    await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: c.id, type: 'contact.owner_changed', actorId: r.userId, payload: { from_owner_id: c.owner_id, to_owner_id: body.ownerId } });
  }
  if (body.optedOut !== undefined && body.optedOut !== c.opted_out) {
    await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: c.id, type: body.optedOut ? 'contact.opted_out' : 'contact.opted_in', actorId: r.userId });
  }
  notify(r, 'contacts.changed', { id: c.id });
  return { ok: true, version: c.version + 1 };
}));

customizationRoutes.post('/contacts/:id/notes', tx(async (r, client, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(5000) }).strict().parse(r.body);
  const c = await client.query(`SELECT 1 FROM contact WHERE id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId]);
  if (!c.rowCount) throw new AppError(404, 'not_found', 'Contact not found');
  const id = newId('note');
  await writeContactEvent(client, { workspaceId: r.workspaceId, contactId: String(r.params['id']), type: 'note.added', actorId: r.userId, payload: { note_id: id, body }, sourceRef: `note:${id}` });
  notify(r, 'contacts.changed', { id: r.params['id'] });
  res.status(201);
  return { id };
}));

customizationRoutes.get('/companies', tx(async (r, client) => {
  const { rows } = await client.query(`SELECT id, name, domain, industry, custom, version, created_at FROM company WHERE workspace_id = $1 ORDER BY name`, [r.workspaceId]);
  return { companies: rows };
}));

customizationRoutes.patch('/companies/:id', tx(async (r, client) => {
  const body = z.object({ name: z.string().trim().min(1).max(200).optional(), custom: z.record(z.unknown()).optional(), version: z.number().int().optional() }).strict().parse(r.body);
  const { rows } = await client.query(`SELECT * FROM company WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [r.params['id'], r.workspaceId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Company not found');
  const version = versionFrom(r, body);
  if (version !== undefined && version !== rows[0].version) throw new AppError(409, 'version_conflict', 'This company changed since you opened it.');
  const fields = await loadFields(client, r.workspaceId, 'company');
  const { next } = applyCustomPatch(fields, rows[0].custom ?? {}, body.custom ?? {});
  await client.query(`UPDATE company SET name = COALESCE($3, name), custom = $4, version = version + 1 WHERE id = $1 AND workspace_id = $2`,
    [rows[0].id, r.workspaceId, body.name ?? null, JSON.stringify(next)]);
  notify(r, 'companies.changed', { id: rows[0].id });
  return { ok: true, version: rows[0].version + 1 };
}));

// ══ Contact history ═══════════════════════════════════════════════════════════
const TYPE_GROUPS: Record<string, string[]> = {
  messages: ['message.%'],
  payments: ['payment.%'],
  stage_fields: ['opportunity.%', 'contact.updated', 'contact.owner_changed'],
  system: ['contact.created', 'contact.opted_%', 'lead.%', 'note.%', 'appointment.%'],
};

customizationRoutes.get('/contacts/:id/events', tx(async (r, client) => {
  const limit = Math.min(Number(r.query['limit']) || 50, 200);
  const group = typeof r.query['group'] === 'string' ? TYPE_GROUPS[r.query['group']] : undefined;
  const cursor = typeof r.query['cursor'] === 'string' ? r.query['cursor'] : null;
  const [cAt, cId] = cursor ? Buffer.from(cursor, 'base64url').toString().split('|') : [null, null];
  const c = await client.query(`SELECT 1 FROM contact WHERE id = $1 AND workspace_id = $2`, [r.params['id'], r.workspaceId]);
  if (!c.rowCount) throw new AppError(404, 'not_found', 'Contact not found');
  const { rows } = await client.query(
    `SELECT e.id, e.type, e.actor_id, u.name AS actor_name, e.opportunity_id, e.payload_json AS payload, e.created_at, e.created_at::text AS cursor_at
     FROM contact_event e LEFT JOIN "user" u ON u.id = e.actor_id
     WHERE e.workspace_id = $1 AND e.contact_id = $2
       AND ($3::text[] IS NULL OR e.type LIKE ANY($3))
       AND ($4::timestamptz IS NULL OR (e.created_at, e.id) < ($4::timestamptz, $5::text))
     ORDER BY e.created_at DESC, e.id DESC LIMIT $6`,
    [r.workspaceId, r.params['id'], group ?? null, cAt, cId, limit + 1]);
  const canView = await canViewValues(client, r);
  const page = rows.slice(0, limit).map((e) => redactEvent(e, canView));
  const last = page.at(-1);
  return {
    events: page,
    nextCursor: rows.length > limit && last ? Buffer.from(`${last.cursor_at}|${last.id}`).toString('base64url') : null,
  };
}));

/** Money in history is shown only to users with values.view; others get "restricted". */
function redactEvent<E extends { type: string; payload: Record<string, unknown> }>(e: E, canView: boolean): E {
  if (canView) return e;
  const payload = { ...e.payload };
  for (const k of ['amount_cents', 'refunded_cents']) if (k in payload) { payload[k] = null; payload['restricted'] = true; }
  if (Array.isArray(payload['changes'])) {
    payload['changes'] = (payload['changes'] as { money?: boolean }[]).map((ch) => (ch.money ? { ...ch, before: null, after: null, restricted: true } : ch));
  }
  return { ...e, payload };
}

// ══ Saved lists ═══════════════════════════════════════════════════════════════
const ruleSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.object({ field: z.string().max(80), operator: z.string().max(20), value: z.unknown().optional() }).strict(),
  z.object({ op: z.enum(['and', 'or']), rules: z.array(ruleSchema).max(50) }).strict(),
]));
const filterSchema = z.object({ op: z.enum(['and', 'or']), rules: z.array(ruleSchema).max(50) }).strict();
const listBody = {
  name: z.string().trim().min(1).max(100), entityType: z.literal('contact').default('contact'), filter: filterSchema,
  columns: z.array(z.string().max(80)).max(60).default([]), sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) }).nullable().optional(),
  visibility: z.enum(['private', 'team', 'workspace']).default('workspace'),
};

const visibleTo = `(l.visibility <> 'private' OR l.owner_id = $2)`;

async function fieldTypeMap(client: PoolClient, ws: string) {
  const { rows } = await client.query<{ id: string; entity_type: EntityType; type: FieldType }>(
    `SELECT id, entity_type, type FROM custom_field WHERE workspace_id = $1`, [ws]);
  return new Map(rows.map((f) => [f.id, { entity: f.entity_type, type: f.type }]));
}

const SORTS: Record<string, string> = { name: 'c.name', last_activity: 'c.last_activity_at', created: 'c.created_at' };

/** Evaluates a filter at read time: membership is never stored. */
async function evaluate(client: PoolClient, ws: string, filter: FilterGroup, opts: { limit: number; offset: number; sort?: { field: string; dir: string } | null }) {
  const compiled = compileContactFilter(filter, await fieldTypeMap(client, ws), 2);
  const where = `c.workspace_id = $1 AND ${compiled.sql}`;
  const order = `${SORTS[opts.sort?.field ?? ''] ?? 'c.last_activity_at'} ${opts.sort?.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, c.id`;
  const params = [ws, ...compiled.params];
  const [{ rows }, { rows: count }] = await Promise.all([
    client.query(`SELECT ${contactSelect},
        (SELECT l.state FROM lead l WHERE l.contact_id = c.id AND l.workspace_id = c.workspace_id ORDER BY l.created_at DESC LIMIT 1) AS lead_status
      FROM contact c WHERE ${where} ORDER BY ${order} LIMIT ${opts.limit} OFFSET ${opts.offset}`, params),
    client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM contact c WHERE ${where}`, params),
  ]);
  return { records: rows, total: count[0].n };
}

customizationRoutes.get('/lists', tx(async (r, client) => {
  const { rows } = await client.query(
    `SELECT l.id, l.owner_id, l.name, l.entity_type, l.filter_json AS filter, l.columns, l.sort, l.visibility, l.version, l.created_at, l.updated_at
     FROM saved_list l WHERE l.workspace_id = $1 AND ${visibleTo} ORDER BY l.created_at`, [r.workspaceId, r.userId]);
  const withCounts = [];
  for (const l of rows) {
    let count: number | null = null;
    try { count = (await evaluate(client, r.workspaceId, l.filter, { limit: 0, offset: 0 })).total; } catch { count = null; }
    withCounts.push({ ...l, count });
  }
  return { lists: withCounts };
}));

async function loadList(client: PoolClient, r: AuthRequest, forWrite = false) {
  const { rows } = await client.query(
    `SELECT l.* FROM saved_list l WHERE l.id = $1 AND l.workspace_id = $3 AND ${visibleTo} ${forWrite ? 'FOR UPDATE' : ''}`,
    [r.params['id'], r.userId, r.workspaceId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'List not found');
  if (forWrite && rows[0].visibility === 'private' && rows[0].owner_id !== r.userId) throw new AppError(403, 'forbidden', 'Only the owner can change a private list');
  return rows[0];
}

customizationRoutes.post('/lists', tx(async (r, client, res) => {
  const body = z.object(listBody).strict().parse(r.body);
  await evaluate(client, r.workspaceId, body.filter as FilterGroup, { limit: 0, offset: 0 }); // validates the filter
  const id = newId('lst');
  await client.query(
    `INSERT INTO saved_list (id, workspace_id, owner_id, name, entity_type, filter_json, columns, sort, visibility) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, r.workspaceId, r.userId, body.name, body.entityType, JSON.stringify(body.filter), JSON.stringify(body.columns), body.sort ? JSON.stringify(body.sort) : null, body.visibility]);
  notify(r, 'lists.changed', { id });
  res.status(201);
  return { id };
}));

customizationRoutes.patch('/lists/:id', tx(async (r, client) => {
  const body = z.object({
    name: listBody.name.optional(), filter: filterSchema.optional(), columns: listBody.columns.optional(), sort: listBody.sort,
    visibility: z.enum(['private', 'team', 'workspace']).optional(), version: z.number().int().optional(),
  }).strict().parse(r.body);
  const list = await loadList(client, r, true);
  const version = versionFrom(r, body);
  if (version !== undefined && version !== list.version) throw new AppError(409, 'version_conflict', 'This list changed since you opened it.');
  if (body.filter) await evaluate(client, r.workspaceId, body.filter as FilterGroup, { limit: 0, offset: 0 });
  await client.query(
    `UPDATE saved_list SET name = COALESCE($3, name), filter_json = COALESCE($4, filter_json), columns = COALESCE($5, columns),
       sort = CASE WHEN $6 THEN $7::jsonb ELSE sort END, visibility = COALESCE($8, visibility), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2`,
    [list.id, r.workspaceId, body.name ?? null, body.filter ? JSON.stringify(body.filter) : null, body.columns ? JSON.stringify(body.columns) : null,
      body.sort !== undefined, body.sort ? JSON.stringify(body.sort) : null, body.visibility ?? null]);
  notify(r, 'lists.changed', { id: list.id });
  return { ok: true, version: list.version + 1 };
}));

customizationRoutes.post('/lists/:id/duplicate', tx(async (r, client, res) => {
  const list = await loadList(client, r);
  const id = newId('lst');
  await client.query(
    `INSERT INTO saved_list (id, workspace_id, owner_id, name, entity_type, filter_json, columns, sort, visibility)
     SELECT $1, workspace_id, $2, left(name || ' (copy)', 100), entity_type, filter_json, columns, sort, 'private' FROM saved_list WHERE id = $3 AND workspace_id = $4`,
    [id, r.userId, list.id, r.workspaceId]);
  notify(r, 'lists.changed', { id });
  res.status(201);
  return { id };
}));

customizationRoutes.delete('/lists/:id', tx(async (r, client) => {
  const list = await loadList(client, r, true);
  if (list.owner_id !== r.userId && !(await canManageSettings(client, r))) throw new AppError(403, 'forbidden', 'Only the owner or a settings manager can delete this list');
  // Deleting a list removes only the saved criteria, never the records.
  await client.query(`DELETE FROM saved_list WHERE id = $1 AND workspace_id = $2`, [list.id, r.workspaceId]);
  notify(r, 'lists.changed', { id: list.id });
}));

async function canManageSettings(client: PoolClient, r: AuthRequest) {
  const { rows } = await client.query<{ role: string; permissions: string[] }>(`SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`, [r.userId, r.workspaceId]);
  return rows[0]?.role === 'owner' || (rows[0]?.permissions ?? []).includes(SETTINGS);
}

const pageQuery = (r: AuthRequest) => ({
  limit: Math.min(Math.max(Number(r.query['limit']) || 25, 1), 200),
  offset: Math.max(Number(r.query['offset']) || 0, 0),
});

customizationRoutes.get('/lists/:id/records', tx(async (r, client) => {
  const list = await loadList(client, r);
  return evaluate(client, r.workspaceId, list.filter_json, { ...pageQuery(r), sort: list.sort });
}));

/** Evaluate an unsaved filter (the table's live filters before "Save view"). */
customizationRoutes.post('/lists/preview', tx(async (r, client) => {
  const body = z.object({ filter: filterSchema, sort: listBody.sort }).strict().parse(r.body);
  return evaluate(client, r.workspaceId, body.filter as FilterGroup, { ...pageQuery(r), sort: body.sort });
}));

