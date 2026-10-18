import type { PoolClient } from 'pg';

/**
 * Demo CRM configuration (rows in the database — the app reads everything
 * from these tables; nothing about fields, stages or pipelines is hard-coded).
 * Two pipelines with DIFFERENT field sets and stage lists.
 */
type Field = { id: string; entity: 'contact' | 'opportunity' | 'company'; key: string; label: string; type: string; options?: string[]; help?: string };

const FIELDS: Field[] = [
  // Contact fields
  { id: 'fld_c_financing', entity: 'contact', key: 'needs_financing', label: 'Needs financing', type: 'checkbox', help: 'Customer asked about payment plans' },
  { id: 'fld_c_budget', entity: 'contact', key: 'budget', label: 'Budget', type: 'currency' },
  { id: 'fld_c_contact_time', entity: 'contact', key: 'preferred_contact_time', label: 'Preferred contact time', type: 'select', options: ['Morning', 'Afternoon', 'Evening'] },
  // Company field
  { id: 'fld_co_size', entity: 'company', key: 'employee_count', label: 'Employees', type: 'number' },
  // Residential opportunity fields
  { id: 'fld_o_roof', entity: 'opportunity', key: 'roof_type', label: 'Roof type', type: 'select', options: ['Asphalt', 'Metal', 'Tile', 'Flat'] },
  { id: 'fld_o_sqft', entity: 'opportunity', key: 'square_footage', label: 'Square footage', type: 'number' },
  { id: 'fld_o_inspect', entity: 'opportunity', key: 'inspection_date', label: 'Inspection date', type: 'date' },
  // Commercial opportunity fields
  { id: 'fld_o_building', entity: 'opportunity', key: 'building_type', label: 'Building type', type: 'select', options: ['Warehouse', 'Retail', 'Office', 'Multi-family'] },
  { id: 'fld_o_units', entity: 'opportunity', key: 'number_of_units', label: 'Number of units', type: 'number' },
  { id: 'fld_o_po', entity: 'opportunity', key: 'po_number', label: 'PO number', type: 'text' },
  // Shared by both pipelines
  { id: 'fld_o_loss', entity: 'opportunity', key: 'loss_reason', label: 'Loss reason', type: 'select', options: ['Price', 'Timing', 'Competitor', 'No response'] },
];

const PIPELINES = [
  {
    id: 'pip_residential', name: 'Residential', fields: ['fld_o_roof', 'fld_o_sqft', 'fld_o_inspect', 'fld_o_loss'],
    stages: [
      { id: 'stg_r_new', name: 'New', type: 'open', color: '#64748b', req: [] },
      { id: 'stg_r_inspected', name: 'Inspected', type: 'open', color: '#0ea5e9', req: ['fld_o_inspect'] },
      { id: 'stg_r_quoted', name: 'Quoted', type: 'open', color: '#f59e0b', req: ['fld_o_roof', 'fld_o_sqft'] },
      { id: 'stg_r_won', name: 'Won', type: 'won', color: '#16a34a', req: ['fld_o_roof'] },
      { id: 'stg_r_lost', name: 'Lost', type: 'lost', color: '#dc2626', req: ['fld_o_loss'] },
    ],
  },
  {
    id: 'pip_commercial', name: 'Commercial', fields: ['fld_o_building', 'fld_o_units', 'fld_o_po', 'fld_o_loss'],
    stages: [
      { id: 'stg_c_lead', name: 'Lead', type: 'open', color: '#64748b', req: [] },
      { id: 'stg_c_survey', name: 'Site survey', type: 'open', color: '#0ea5e9', req: ['fld_o_building'] },
      { id: 'stg_c_proposal', name: 'Proposal', type: 'open', color: '#8b5cf6', req: ['fld_o_units'] },
      { id: 'stg_c_negotiation', name: 'Negotiation', type: 'open', color: '#f59e0b', req: [] },
      { id: 'stg_c_won', name: 'Won', type: 'won', color: '#16a34a', req: ['fld_o_po'] },
      { id: 'stg_c_lost', name: 'Lost', type: 'lost', color: '#dc2626', req: ['fld_o_loss'] },
    ],
  },
];

export async function seedCrmConfig(client: PoolClient, ws = 'ws_demo'): Promise<void> {
  for (const [i, f] of FIELDS.entries()) {
    await client.query(
      `INSERT INTO custom_field (id, workspace_id, entity_type, key, name, type, options, help_text, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [f.id, ws, f.entity, f.key, f.label, f.type, JSON.stringify(f.options ?? []), f.help ?? null, i]);
  }
  for (const [pi, p] of PIPELINES.entries()) {
    await client.query(`INSERT INTO pipeline (id, workspace_id, name, position) VALUES ($1,$2,$3,$4)`, [p.id, ws, p.name, pi]);
    for (const [si, s] of p.stages.entries()) {
      await client.query(
        `INSERT INTO stage (id, workspace_id, pipeline_id, name, position, type, color, required_field_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.id, ws, p.id, s.name, si, s.type, s.color, s.req]);
    }
    for (const [fi, fieldId] of p.fields.entries()) {
      await client.query(`INSERT INTO pipeline_field (workspace_id, pipeline_id, field_id, position) VALUES ($1,$2,$3,$4)`, [ws, p.id, fieldId, fi]);
    }
  }
  await client.query(`INSERT INTO company (id, workspace_id, name, custom) VALUES ('com_demo_1', $1, 'Birchwood Properties', '{"fld_co_size": 40}')`, [ws]);
}

export async function seedDemoOpportunities(client: PoolClient, ws = 'ws_demo'): Promise<void> {
  const opps = [
    ['opp_demo_1', 'con_demo_1', 'pip_residential', 'stg_r_new', 'Roof replacement — 142 Birchwood', 1840000, {}],
    ['opp_demo_2', 'con_demo_2', 'pip_residential', 'stg_r_inspected', 'Storm damage repair — Elm Ct', 920000, { fld_o_inspect: '2026-10-10' }],
    ['opp_demo_3', 'con_demo_3', 'pip_residential', 'stg_r_quoted', 'Re-roof — Sunset Blvd', 2260000, { fld_o_inspect: '2026-10-02', fld_o_roof: 'Tile', fld_o_sqft: 2400 }],
    ['opp_demo_4', 'con_demo_4', 'pip_commercial', 'stg_c_lead', 'Warehouse membrane — Dock 4', 5400000, {}],
    ['opp_demo_5', 'con_demo_5', 'pip_commercial', 'stg_c_survey', 'Retail strip re-roof', 3100000, { fld_o_building: 'Retail' }],
  ] as const;
  for (const [id, contact, pipeline, stage, name, value, custom] of opps) {
    await client.query(
      `INSERT INTO opportunity (id, workspace_id, contact_id, pipeline_id, stage_id, name, value_cents, custom) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, ws, contact, pipeline, stage, name, value, JSON.stringify(custom)]);
    await client.query(
      `INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, payload_json, source_ref) VALUES ($1,$2,$3,'opportunity.created',$4,$5)`,
      [ws, contact, id, JSON.stringify({ name }), `opportunity:${id}`]);
  }
  await client.query(`UPDATE contact SET company_id = 'com_demo_1' WHERE id IN ('con_demo_1', 'con_demo_4') AND workspace_id = $1`, [ws]);
}

/** A second tenant so isolation is demonstrable (and testable) with real data. */
export async function seedSecondWorkspace(client: PoolClient, ownerHash: string): Promise<void> {
  await client.query(`INSERT INTO workspace (id, name, slug) VALUES ('ws_acme', 'Acme Gutters', 'acme-gutters')`);
  await client.query(
    `INSERT INTO "user" (id, workspace_id, email, password_hash, name, role, status, in_rotation)
     VALUES ('u_acme_owner', 'ws_acme', 'owner@acme.test', $1, 'Acme Owner', 'owner', 'available', true)`, [ownerHash]);
  await client.query(`INSERT INTO pipeline (id, workspace_id, name) VALUES ('pip_acme', 'ws_acme', 'Acme Sales')`);
  await client.query(`INSERT INTO stage (id, workspace_id, pipeline_id, name, position, type) VALUES
    ('stg_acme_new', 'ws_acme', 'pip_acme', 'New', 0, 'open'), ('stg_acme_won', 'ws_acme', 'pip_acme', 'Won', 1, 'won')`);
  await client.query(`INSERT INTO custom_field (id, workspace_id, entity_type, key, name, type) VALUES ('fld_acme_secret', 'ws_acme', 'contact', 'acme_secret', 'Acme secret', 'text')`);
  await client.query(`INSERT INTO contact (id, workspace_id, name, phone_e164, owner_id, custom) VALUES ('con_acme_1', 'ws_acme', 'Acme Secret Contact', '+15550009999', 'u_acme_owner', '{"fld_acme_secret": "classified"}')`);
  await client.query(`INSERT INTO opportunity (id, workspace_id, contact_id, pipeline_id, stage_id, name) VALUES ('opp_acme_1', 'ws_acme', 'con_acme_1', 'pip_acme', 'stg_acme_new', 'Acme gutters')`);
  await client.query(`INSERT INTO saved_list (id, workspace_id, owner_id, name) VALUES ('lst_acme_1', 'ws_acme', 'u_acme_owner', 'Acme list')`);
  await client.query(`INSERT INTO contact_event (workspace_id, contact_id, type, payload_json) VALUES ('ws_acme', 'con_acme_1', 'contact.created', '{"name":"Acme Secret Contact"}')`);
}
