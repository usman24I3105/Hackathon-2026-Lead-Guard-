import type { PoolClient } from 'pg';
import { AppError } from '../http/errors';

// ── Field definitions ─────────────────────────────────────────────────────────
export const FIELD_TYPES = [
  'text', 'long_text', 'number', 'currency', 'date', 'select', 'multi_select',
  'checkbox', 'url', 'phone', 'email',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const ENTITY_TYPES = ['contact', 'opportunity', 'company'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  must_be_true: boolean;
}

/**
 * "Filled" for stage requirements:
 * - null/undefined, empty or whitespace-only strings, and empty arrays are empty;
 * - 0 is a valid number;
 * - false counts as filled, unless the field is defined as must-be-true
 *   (e.g. "Terms accepted"), in which case only `true` is filled.
 */
export function isFilled(value: unknown, field: Pick<FieldDef, 'type' | 'must_be_true'>): boolean {
  if (value === null || value === undefined) return false;
  if (field.type === 'checkbox') return field.must_be_true ? value === true : typeof value === 'boolean';
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

export function slugKey(label: string): string {
  return label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'field';
}

/** Validates and normalises one value against its definition. Throws 422 on bad input. */
export function coerceValue(field: FieldDef, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === '') return null;
  const bad = (why: string) => new AppError(422, 'validation_failed', `${field.label}: ${why}`, { field_id: field.id });
  switch (field.type) {
    case 'number':
    case 'currency': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) throw bad('must be a number');
      return n;
    }
    case 'checkbox':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'false') return raw === 'true';
      throw bad('must be true or false');
    case 'date':
      if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) throw bad('must be a date');
      return raw.slice(0, 10);
    case 'select':
      if (typeof raw !== 'string' || !(field.options ?? []).includes(raw)) throw bad('is not one of the options');
      return raw;
    case 'multi_select': {
      const arr = Array.isArray(raw) ? raw : [raw];
      if (!arr.every((v) => typeof v === 'string' && (field.options ?? []).includes(v))) throw bad('has an unknown option');
      return arr;
    }
    case 'email':
      if (typeof raw !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw bad('must be an email');
      return raw.trim();
    case 'url':
      if (typeof raw !== 'string' || !/^https?:\/\/\S+$/i.test(raw)) throw bad('must be an http(s) URL');
      return raw.trim();
    default:
      if (typeof raw !== 'string') throw bad('must be text');
      if (raw.length > 5000) throw bad('is too long');
      return raw;
  }
}

export async function loadFields(client: PoolClient, workspaceId: string, entity: EntityType, includeArchived = false): Promise<FieldDef[]> {
  const { rows } = await client.query<FieldDef>(
    `SELECT id, name AS label, type, options, must_be_true FROM custom_field
     WHERE workspace_id = $1 AND entity_type = $2 ${includeArchived ? '' : 'AND archived_at IS NULL'}
     ORDER BY position, created_at`,
    [workspaceId, entity],
  );
  return rows;
}

/** Merge a patch of custom values (keyed by field id) into existing values; returns diff. */
export function applyCustomPatch(
  fields: FieldDef[],
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): { next: Record<string, unknown>; diff: FieldDiff[] } {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const next = { ...current };
  const diff: FieldDiff[] = [];
  for (const [fieldId, raw] of Object.entries(patch)) {
    const field = byId.get(fieldId);
    if (!field) throw new AppError(422, 'validation_failed', `Unknown field ${fieldId}`, { field_id: fieldId });
    const value = coerceValue(field, raw);
    const before = current[fieldId] ?? null;
    if (JSON.stringify(before) === JSON.stringify(value)) continue;
    if (value === null) delete next[fieldId]; else next[fieldId] = value;
    diff.push({ field_id: fieldId, label: field.label, before, after: value });
  }
  return { next, diff };
}

export interface FieldDiff { field_id: string; label: string; before: unknown; after: unknown }

// ── Contact history ───────────────────────────────────────────────────────────
export interface ContactEventInput {
  workspaceId: string;
  contactId: string;
  type: string;
  actorId: string | null;
  opportunityId?: string | null;
  payload?: Record<string, unknown>;
  sourceRef?: string;
}

/** Appends to contact_event on the caller's transaction, so it commits or rolls back with the change. */
export async function writeContactEvent(client: PoolClient, e: ContactEventInput): Promise<void> {
  await client.query(
    `INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, actor_id, payload_json, source_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [e.workspaceId, e.contactId, e.opportunityId ?? null, e.type, e.actorId, JSON.stringify(e.payload ?? {}), e.sourceRef ?? null],
  );
  await client.query(`UPDATE contact SET last_activity_at = NOW() WHERE id = $1 AND workspace_id = $2`, [e.contactId, e.workspaceId]);
}

// ── Ordering ──────────────────────────────────────────────────────────────────
/** Returns ids in their new order after moving `id` to `targetIndex` (clamped). */
export function reorder(ids: string[], id: string, targetIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) throw new AppError(404, 'not_found', 'Item not found');
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, id);
  return next;
}

/** Writes compacted positions 0..n-1 for `orderedIds` in one statement. */
export async function writePositions(client: PoolClient, table: 'stage' | 'custom_field' | 'pipeline', workspaceId: string, orderedIds: string[]): Promise<void> {
  await client.query(
    `UPDATE ${table} t SET position = o.pos - 1
     FROM unnest($2::text[]) WITH ORDINALITY AS o(id, pos)
     WHERE t.id = o.id AND t.workspace_id = $1`,
    [workspaceId, orderedIds],
  );
}

// ── Saved-list filters ────────────────────────────────────────────────────────
/**
 * filter_json = { op: 'and'|'or', rules: (Rule | Group)[] }
 * Rule = { field, operator, value } where field is a built-in
 * (name, status, owner, source, last_activity, stage, pipeline, opted_out)
 * or `cf:<fieldId>` for a contact or opportunity custom field.
 */
export type FilterRule = { field: string; operator: string; value?: unknown };
export type FilterGroup = { op: 'and' | 'or'; rules: (FilterRule | FilterGroup)[] };

const OPS = ['eq', 'neq', 'contains', 'empty', 'not_empty', 'gt', 'lt', 'in', 'is_true', 'is_false', 'within_days'] as const;

export interface CompiledFilter { sql: string; params: unknown[] }

/**
 * Compiles a filter into a WHERE fragment over `contact c` (params start at $startAt).
 * Contacts match opportunity criteria when ANY of their opportunities matches.
 */
export function compileContactFilter(
  group: FilterGroup,
  fieldTypes: Map<string, { entity: EntityType; type: FieldType }>,
  startAt: number,
): CompiledFilter {
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${startAt + params.length - 1}`; };

  const cmp = (expr: string, r: FilterRule, numeric = false): string => {
    const v = r.value;
    const val = numeric ? `${expr}::numeric` : expr;
    switch (r.operator) {
      case 'eq': return `${val} = ${p(numeric ? Number(v) : String(v))}`;
      case 'neq': return `(${val} IS DISTINCT FROM ${p(numeric ? Number(v) : String(v))})`;
      case 'contains': return `${expr} ILIKE ${p(`%${String(v ?? '').replace(/[%_]/g, '\\$&')}%`)}`;
      case 'gt': return `${val} > ${p(numeric ? Number(v) : String(v))}`;
      case 'lt': return `${val} < ${p(numeric ? Number(v) : String(v))}`;
      case 'in': return `${expr} = ANY(${p((Array.isArray(v) ? v : [v]).map(String))}::text[])`;
      case 'empty': return `(${expr} IS NULL OR ${expr} = '')`;
      case 'not_empty': return `(${expr} IS NOT NULL AND ${expr} <> '')`;
      default: throw new AppError(422, 'validation_failed', `Operator ${r.operator} not valid for ${r.field}`);
    }
  };

  const rule = (r: FilterRule): string => {
    if (!OPS.includes(r.operator as (typeof OPS)[number])) throw new AppError(422, 'validation_failed', `Unknown operator ${r.operator}`);
    switch (r.field) {
      case 'name': return cmp('c.name', r);
      case 'owner': return cmp('c.owner_id', r);
      case 'source': return cmp('c.source', r);
      case 'opted_out': return r.operator === 'is_true' ? 'c.opted_out' : 'NOT c.opted_out';
      case 'status':
        return `EXISTS (SELECT 1 FROM lead l WHERE l.workspace_id = c.workspace_id AND l.contact_id = c.id AND ${cmp('l.state', r)})`;
      case 'stage':
        return `EXISTS (SELECT 1 FROM opportunity o WHERE o.workspace_id = c.workspace_id AND o.contact_id = c.id AND ${cmp('o.stage_id', r)})`;
      case 'pipeline':
        return `EXISTS (SELECT 1 FROM opportunity o WHERE o.workspace_id = c.workspace_id AND o.contact_id = c.id AND ${cmp('o.pipeline_id', r)})`;
      case 'last_activity':
        if (r.operator === 'within_days') return `c.last_activity_at >= NOW() - (${p(Number(r.value))} || ' days')::interval`;
        if (r.operator === 'empty') return 'c.last_activity_at IS NULL';
        return cmp('c.last_activity_at::text', r);
    }
    if (!r.field.startsWith('cf:')) throw new AppError(422, 'validation_failed', `Unknown filter field ${r.field}`);
    const fieldId = r.field.slice(3);
    const def = fieldTypes.get(fieldId);
    if (!def) throw new AppError(422, 'validation_failed', `Unknown custom field ${fieldId}`);
    const table = def.entity === 'opportunity' ? 'o' : 'c';
    const key = p(fieldId);
    const text = `${table}.custom->>${key}`;
    let cond: string;
    if (def.type === 'checkbox') {
      cond = r.operator === 'is_true' ? `(${table}.custom->${key}) = 'true'::jsonb`
        : r.operator === 'is_false' ? `COALESCE((${table}.custom->${key}) = 'false'::jsonb OR NOT (${table}.custom ? ${key}), true)`
        : cmp(text, r);
    } else if (def.type === 'multi_select' && (r.operator === 'eq' || r.operator === 'in')) {
      const vals = (Array.isArray(r.value) ? r.value : [r.value]).map(String);
      cond = `(${table}.custom->${key}) ?| ${p(vals)}::text[]`;
    } else if (def.type === 'multi_select' && (r.operator === 'empty' || r.operator === 'not_empty')) {
      const has = `jsonb_array_length(COALESCE(${table}.custom->${key}, '[]'::jsonb)) > 0`;
      cond = r.operator === 'empty' ? `NOT (${has})` : has;
    } else {
      cond = cmp(text, r, def.type === 'number' || def.type === 'currency');
    }
    return table === 'o'
      ? `EXISTS (SELECT 1 FROM opportunity o WHERE o.workspace_id = c.workspace_id AND o.contact_id = c.id AND ${cond})`
      : cond;
  };

  const walk = (g: FilterGroup, depth: number): string => {
    if (depth > 4) throw new AppError(422, 'validation_failed', 'Filter nesting too deep');
    if (!g.rules?.length) return 'TRUE';
    const parts = g.rules.map((x) => ('rules' in x ? walk(x as FilterGroup, depth + 1) : rule(x as FilterRule)));
    return `(${parts.join(g.op === 'or' ? ' OR ' : ' AND ')})`;
  };

  return { sql: walk(group, 0), params };
}
