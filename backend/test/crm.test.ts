/**
 * Customizable CRM — API integration tests against the real app + Postgres.
 * Requires the demo seed (npm run seed:demo); each run re-seeds first.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

let server: Server;
let base = '';
const ORIGIN = 'http://localhost:5173';
type Session = { cookie: string };
let owner: Session; let user: Session; let acme: Session;

async function login(email: string, password: string): Promise<Session> {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: hdr(), body: JSON.stringify({ email, password }) });
  expect(r.status, `login ${email}`).toBe(200);
  return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0] };
}
function hdr(s?: Session): Record<string, string> {
  return { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-CSRF-Token': '1', ...(s ? { Cookie: s.cookie } : {}) };
}
async function api(s: Session | undefined, method: string, path: string, body?: unknown) {
  const r = await fetch(`${base}/api/crm${path}`, { method, headers: hdr(s), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  execSync('npx tsx src/db/seed-demo.ts', { stdio: 'ignore' });
  const { buildApp } = await import('../src/http/app');
  server = buildApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  owner = await login('amina@demo.com', process.env['DEMO_OWNER_PASSWORD']!);
  user = await login('imran@demo.com', process.env['DEMO_USER_PASSWORD']!);
  acme = await login('owner@acme.test', process.env['DEMO_OWNER_PASSWORD']!);
}, 60000);
afterAll(() => new Promise<void>((done) => server.close(() => done())));

describe('auth & tenant isolation (cross-cutting)', () => {
  const endpoints = ['/fields', '/pipelines', '/contacts', '/opportunities', '/lists', '/contacts/con_demo_1/events'];
  it.each(endpoints)('rejects anonymous GET %s with 401', async (p) => {
    expect((await api(undefined, 'GET', p)).status).toBe(401);
  });

  it('never returns another workspace\'s rows in lists', async () => {
    for (const p of ['/fields', '/pipelines', '/contacts', '/opportunities', '/lists']) {
      const raw = JSON.stringify((await api(owner, 'GET', p)).body);
      expect(raw, p).not.toMatch(/acme/i);
    }
    const acmeRaw = JSON.stringify((await api(acme, 'GET', '/contacts')).body);
    expect(acmeRaw).not.toContain('con_demo_1');
  });

  it('returns 404 (no leak) for another workspace\'s ids, read and write', async () => {
    const probes: [string, string, unknown?][] = [
      ['GET', '/contacts/con_acme_1'], ['GET', '/contacts/con_acme_1/events'],
      ['PATCH', '/contacts/con_acme_1', { name: 'pwned' }], ['PATCH', '/fields/fld_acme_secret', { label: 'pwned' }],
      ['POST', '/opportunities/opp_acme_1/move', { stageId: 'stg_acme_won' }], ['PATCH', '/stages/stg_acme_new', { name: 'pwned' }],
      ['DELETE', '/lists/lst_acme_1'], ['GET', '/lists/lst_acme_1/records'],
    ];
    for (const [m, p, b] of probes) {
      const r = await api(owner, m, p, b);
      expect(r.status, `${m} ${p}`).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain('classified');
    }
    const check = await api(acme, 'GET', '/contacts/con_acme_1');
    expect(check.body.name).toBe('Acme Secret Contact');
  });

  it('cannot move a record into another workspace\'s stage', async () => {
    expect((await api(owner, 'POST', '/opportunities/opp_demo_1/move', { stageId: 'stg_acme_won' })).status).toBe(404);
  });

  it('settings endpoints require Manage settings (403 for a regular user)', async () => {
    expect((await api(user, 'POST', '/fields', { entityType: 'contact', label: 'Nope', type: 'text' })).status).toBe(403);
    expect((await api(user, 'PATCH', '/stages/stg_r_new', { name: 'Nope' })).status).toBe(403);
    expect((await api(user, 'POST', '/stages/stg_r_new/reorder', { targetIndex: 2 })).status).toBe(403);
    expect((await api(user, 'POST', '/pipelines', { name: 'Nope' })).status).toBe(403);
  });
});

describe('R1 custom fields', () => {
  let fieldId = '';
  it('creates a field that is immediately listed', async () => {
    const r = await api(owner, 'POST', '/fields', { entityType: 'contact', label: 'Gate code', type: 'text', helpText: 'For site visits' });
    expect(r.status).toBe(201);
    fieldId = r.body.id;
    expect(r.body.key).toBe('gate_code');
    const list = await api(user, 'GET', '/fields?entity=contact');
    expect(list.body.fields.map((f: { id: string }) => f.id)).toContain(fieldId);
  });
  it('validates: unique key, label, select options', async () => {
    expect((await api(owner, 'POST', '/fields', { entityType: 'contact', label: 'Gate code', type: 'text' })).status).toBe(409);
    expect((await api(owner, 'POST', '/fields', { entityType: 'contact', label: '  ', type: 'text' })).status).toBe(400);
    expect((await api(owner, 'POST', '/fields', { entityType: 'contact', label: 'Colour', type: 'select', options: [] })).status).toBe(422);
  });
  it('a regular user can fill values; values are keyed by field id', async () => {
    expect((await api(user, 'PATCH', '/contacts/con_demo_1', { custom: { [fieldId]: '#4321' } })).status).toBe(200);
    const c = await api(user, 'GET', '/contacts/con_demo_1');
    expect(c.body.custom[fieldId]).toBe('#4321');
  });
  it('type is locked once values exist; archive is soft and keeps values', async () => {
    expect((await api(owner, 'PATCH', `/fields/${fieldId}`, { type: 'number' })).status).toBe(422);
    expect((await api(owner, 'PATCH', `/fields/${fieldId}`, { label: 'Gate / door code' })).status).toBe(200);
    expect((await api(owner, 'POST', `/fields/${fieldId}/archive`)).status).toBe(200);
    const active = await api(owner, 'GET', '/fields?entity=contact');
    expect(active.body.fields.map((f: { id: string }) => f.id)).not.toContain(fieldId);
    expect((await api(owner, 'GET', '/contacts/con_demo_1')).body.custom[fieldId]).toBe('#4321');
    expect((await api(owner, 'DELETE', `/fields/${fieldId}`)).status).toBe(405);
  });
});

describe('R2 pipelines & stages', () => {
  it('has two pipelines with different fields and stages', async () => {
    const { body } = await api(owner, 'GET', '/pipelines');
    const res = body.pipelines.find((p: { name: string }) => p.name === 'Residential');
    const com = body.pipelines.find((p: { name: string }) => p.name === 'Commercial');
    expect(res.field_ids).toContain('fld_o_roof');
    expect(com.field_ids).not.toContain('fld_o_roof');
    expect(com.field_ids).toContain('fld_o_building');
    expect(res.stages.map((s: { name: string }) => s.name)).not.toEqual(com.stages.map((s: { name: string }) => s.name));
  });
  it('adds, renames and reorders stages with compact positions', async () => {
    const add = await api(owner, 'POST', '/stages', { pipelineId: 'pip_residential', name: 'Scheduled' });
    expect(add.status).toBe(201);
    let stages = (await api(owner, 'GET', '/pipelines')).body.pipelines.find((p: { id: string }) => p.id === 'pip_residential').stages;
    const added = stages.find((s: { id: string }) => s.id === add.body.id);
    expect((await api(owner, 'PATCH', `/stages/${added.id}`, { name: 'Install scheduled', version: added.version })).status).toBe(200);
    expect((await api(owner, 'POST', `/stages/${added.id}/reorder`, { targetIndex: 0 })).status).toBe(200);
    stages = (await api(owner, 'GET', '/pipelines')).body.pipelines.find((p: { id: string }) => p.id === 'pip_residential').stages;
    expect(stages[0].name).toBe('Install scheduled');
    expect(stages.map((s: { position: number }) => s.position)).toEqual(stages.map((_: unknown, i: number) => i));
  });
  it('concurrent reorders leave no duplicate or gapped positions', async () => {
    const ids = (await api(owner, 'GET', '/pipelines')).body.pipelines.find((p: { id: string }) => p.id === 'pip_commercial').stages.map((s: { id: string }) => s.id);
    await Promise.all(ids.map((id: string, i: number) => api(owner, 'POST', `/stages/${id}/reorder`, { targetIndex: (i * 3) % ids.length })));
    const stages = (await api(owner, 'GET', '/pipelines')).body.pipelines.find((p: { id: string }) => p.id === 'pip_commercial').stages;
    expect(stages.map((s: { position: number }) => s.position).sort()).toEqual(ids.map((_: unknown, i: number) => i));
  });
  it('stale edit gets a conflict instead of a silent overwrite', async () => {
    const r = await api(owner, 'PATCH', '/stages/stg_r_new', { name: 'X', version: 0 });
    expect(r.status).toBe(409);
  });
  it('blocks deleting a stage with opportunities unless a destination is given; blocks the last open stage', async () => {
    expect((await api(owner, 'DELETE', '/stages/stg_c_survey')).status).toBe(409);
    expect((await api(owner, 'DELETE', '/stages/stg_c_survey?moveTo=stg_c_lead')).status).toBe(200);
    expect((await api(acme, 'DELETE', '/stages/stg_acme_new')).status).toBe(409); // only open stage
  });
  it('disallows moving between pipelines', async () => {
    const r = await api(owner, 'POST', '/opportunities/opp_demo_1/move', { stageId: 'stg_c_lead' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('CROSS_PIPELINE_MOVE');
  });
});

describe('R3 stage requirements', () => {
  it('blocks with the exact 422 payload and makes no change', async () => {
    const r = await api(user, 'POST', '/opportunities/opp_demo_1/move', { stageId: 'stg_r_quoted' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('STAGE_REQUIRED_FIELDS_MISSING');
    expect(r.body.missing.map((m: { field_id: string; label: string }) => [m.field_id, m.label])).toEqual([['fld_o_roof', 'Roof type'], ['fld_o_sqft', 'Square footage']]);
    const opp = (await api(owner, 'GET', '/opportunities')).body.opportunities.find((o: { id: string }) => o.id === 'opp_demo_1');
    expect(opp.stage_id).toBe('stg_r_new');
    const events = (await api(owner, 'GET', '/contacts/con_demo_1/events')).body.events;
    expect(events.some((e: { type: string }) => e.type === 'opportunity.stage_changed')).toBe(false);
  });
  it('partial values are rejected atomically', async () => {
    const r = await api(user, 'POST', '/opportunities/opp_demo_1/move', { stageId: 'stg_r_quoted', fields: { fld_o_roof: 'Metal' } });
    expect(r.status).toBe(422);
    const opp = (await api(owner, 'GET', '/opportunities')).body.opportunities.find((o: { id: string }) => o.id === 'opp_demo_1');
    expect(opp.custom.fld_o_roof).toBeUndefined();
  });
  it('0 counts as filled; values + move + history commit together', async () => {
    const r = await api(user, 'POST', '/opportunities/opp_demo_1/move', { stageId: 'stg_r_quoted', fields: { fld_o_roof: 'Metal', fld_o_sqft: 0 } });
    expect(r.status).toBe(200);
    const events = (await api(owner, 'GET', '/contacts/con_demo_1/events')).body.events;
    const move = events.find((e: { type: string }) => e.type === 'opportunity.stage_changed');
    expect(move.payload).toMatchObject({ from_stage_name: 'New', to_stage_name: 'Quoted' });
    expect(move.actor_id).toBe('u_imran');
    expect(move.payload.fields_changed.map((f: { label: string }) => f.label)).toEqual(['Roof type', 'Square footage']);
  });
  it('PATCH cannot bypass the move service', async () => {
    expect((await api(owner, 'PATCH', '/opportunities/opp_demo_1', { stageId: 'stg_r_won' })).status).toBe(400);
  });
  it('lost stage has its own requirement; bulk move reports per record', async () => {
    const r = await api(owner, 'POST', '/opportunities/bulk-move', { ids: ['opp_demo_2', 'opp_demo_3', 'opp_missing'], stageId: 'stg_r_lost' });
    expect(r.body.moved).toBe(0);
    expect(r.body.results.map((x: { code: string }) => x.code)).toEqual(['STAGE_REQUIRED_FIELDS_MISSING', 'STAGE_REQUIRED_FIELDS_MISSING', 'not_found']);
  });
  it('adding a requirement flags, but does not move, existing opportunities', async () => {
    const st = (await api(owner, 'GET', '/pipelines')).body.pipelines.find((p: { id: string }) => p.id === 'pip_residential').stages.find((s: { id: string }) => s.id === 'stg_r_inspected');
    await api(owner, 'PATCH', '/stages/stg_r_inspected', { requiredFieldIds: ['fld_o_inspect', 'fld_o_roof'], version: st.version });
    const opp = (await api(owner, 'GET', '/opportunities')).body.opportunities.find((o: { id: string }) => o.id === 'opp_demo_2');
    expect(opp.stage_id).toBe('stg_r_inspected');
    expect(opp.missing_required).toEqual(['fld_o_roof']);
  });
});

describe('R4 saved lists & history', () => {
  let listId = '';
  const filter = { op: 'and', rules: [{ field: 'stage', operator: 'eq', value: 'stg_r_quoted' }, { field: 'cf:fld_c_financing', operator: 'is_true' }] };
  it('stores criteria and evaluates membership at read time', async () => {
    const r = await api(user, 'POST', '/lists', { name: 'Quoted + Needs financing', filter });
    expect(r.status).toBe(201);
    listId = r.body.id;
    const before = await api(user, 'GET', `/lists/${listId}/records`);
    const ids0 = before.body.records.map((c: { id: string }) => c.id);
    expect(ids0).not.toContain('con_demo_1');
    await api(user, 'PATCH', '/contacts/con_demo_1', { custom: { fld_c_financing: true } });
    const after = await api(user, 'GET', `/lists/${listId}/records`);
    expect(after.body.records.map((c: { id: string }) => c.id)).toContain('con_demo_1');
    expect(after.body.total).toBe(before.body.total + 1);
    await api(user, 'PATCH', '/contacts/con_demo_1', { custom: { fld_c_financing: false } });
    const gone = await api(user, 'GET', `/lists/${listId}/records`);
    expect(gone.body.records.map((c: { id: string }) => c.id)).not.toContain('con_demo_1');
    const lists = (await api(user, 'GET', '/lists')).body.lists;
    expect(lists.find((l: { id: string }) => l.id === listId).count).toBe(gone.body.total);
  });
  it('rename, duplicate, delete never touches records', async () => {
    expect((await api(user, 'PATCH', `/lists/${listId}`, { name: 'Renamed' })).status).toBe(200);
    const dup = await api(user, 'POST', `/lists/${listId}/duplicate`);
    expect(dup.status).toBe(201);
    const n = (await api(owner, 'GET', '/contacts')).body.total;
    expect((await api(user, 'DELETE', `/lists/${dup.body.id}`)).status).toBe(200);
    expect((await api(owner, 'GET', '/contacts')).body.total).toBe(n);
  });
  it('private lists are invisible to others', async () => {
    const r = await api(owner, 'POST', '/lists', { name: 'Mine only', filter: { op: 'and', rules: [] }, visibility: 'private' });
    expect((await api(user, 'GET', `/lists/${r.body.id}/records`)).status).toBe(404);
  });
  it('rejects unknown filter fields', async () => {
    expect((await api(user, 'POST', '/lists/preview', { filter: { op: 'and', rules: [{ field: 'password_hash', operator: 'eq', value: 'x' }] } })).status).toBe(422);
  });
  it('history: field diffs, opt-out, owner, note; paginated; append-only', async () => {
    await api(user, 'PATCH', '/contacts/con_demo_1', { optedOut: true, ownerId: 'u_dana', custom: { fld_c_contact_time: 'Evening' } });
    await api(user, 'POST', '/contacts/con_demo_1/notes', { body: 'Prefers texts' });
    const first = await api(user, 'GET', '/contacts/con_demo_1/events?limit=3');
    expect(first.body.events).toHaveLength(3);
    expect(first.body.nextCursor).toBeTruthy();
    const all: { type: string; payload: { changes?: { label: string; before: unknown; after: unknown }[] } }[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { events: typeof all; nextCursor: string | null } } = await api(user, 'GET', `/contacts/con_demo_1/events?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      all.push(...page.body.events); cursor = page.body.nextCursor;
    } while (cursor);
    const types = all.map((e) => e.type);
    for (const t of ['note.added', 'contact.opted_out', 'contact.owner_changed', 'contact.updated', 'opportunity.stage_changed', 'contact.created', 'lead.created']) expect(types, t).toContain(t);
    const diff = all.find((e) => e.type === 'contact.updated' && e.payload.changes?.some((c) => c.label === 'Preferred contact time'));
    expect(diff?.payload.changes?.find((c) => c.label === 'Preferred contact time')).toMatchObject({ before: null, after: 'Evening' });
    const pool = new Pool({ connectionString: process.env['DATABASE_URL_APP'] });
    const c = await pool.connect();
    await c.query('BEGIN'); await c.query("SELECT set_config('app.workspace_id','ws_demo',true)");
    await expect(c.query(`UPDATE contact_event SET type = 'x' WHERE contact_id = 'con_demo_1'`)).rejects.toThrow();
    await c.query('ROLLBACK'); c.release(); await pool.end();
  });
  it('payment amounts are restricted in history for users without values.view', async () => {
    const pool = new Pool({ connectionString: process.env['DATABASE_URL_MIGRATOR'] });
    await pool.query(`INSERT INTO payment (id, workspace_id, opportunity_id, amount_cents) VALUES ('pay_t1', 'ws_demo', 'opp_demo_3', 50000)`);
    await pool.end();
    const asUser = (await api(user, 'GET', '/contacts/con_demo_3/events?group=payments')).body.events;
    const asOwner = (await api(owner, 'GET', '/contacts/con_demo_3/events?group=payments')).body.events;
    expect(asUser[0].payload).toMatchObject({ amount_cents: null, restricted: true });
    expect(asOwner[0].payload.amount_cents).toBe(50000);
  });
});
