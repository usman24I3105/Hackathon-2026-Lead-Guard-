/**
 * SEC-3: Row-Level Security test suite
 * Tests PostgreSQL RLS policies, tenant scoping, and role boundaries.
 *
 * Run: npx vitest run test/rls.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

describe('SEC-3: Postgres Row-Level Security Isolation', () => {
  let appPool: Pool;
  const wsA = 'ws_test_rls_a';
  const wsB = 'ws_test_rls_b';

  beforeAll(async () => {
    const connStr = process.env['DATABASE_URL_APP'] || 'postgresql://lg_app:changeme_app@localhost:5432/leadguard';
    appPool = new Pool({ connectionString: connStr });
  });

  afterAll(async () => {
    await appPool.end();
  });

  it('1. Returns 0 rows when tenant context is missing (fails closed)', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      // No set_config('app.workspace_id', ...) is executed
      const res = await client.query('SELECT * FROM lead LIMIT 10');
      expect(res.rows.length).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('2. Enforces tenant isolation — tenant A cannot see tenant B data even without WHERE clause', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.workspace_id', wsA]);

      // Query table with no explicit WHERE workspace_id clause
      const res = await client.query('SELECT workspace_id FROM lead');
      for (const row of res.rows) {
        expect(row.workspace_id).toBe(wsA);
        expect(row.workspace_id).not.toBe(wsB);
      }

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('3. Rejects cross-tenant INSERT via WITH CHECK policy', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      // Set tenant context to workspace A
      await client.query('SELECT set_config($1, $2, true)', ['app.workspace_id', wsA]);

      // Attempt to insert record for workspace B while session is scoped to A
      let threw = false;
      try {
        await client.query(
          `INSERT INTO contact (id, workspace_id, name, phone_e164)
           VALUES ('con_bad_cross', $1, 'Cross-Tenant Attack', '+15559990000')`,
          [wsB],
        );
      } catch (err) {
        threw = true;
      }

      expect(threw).toBe(true);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('4. Prohibits TRUNCATE by lg_app role', async () => {
    const client = await appPool.connect();
    try {
      let threw = false;
      try {
        await client.query('TRUNCATE TABLE lead');
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      client.release();
    }
  });
});
