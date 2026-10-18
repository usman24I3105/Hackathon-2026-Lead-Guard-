const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/leadguard' });
async function run() {
  const { rows } = await p.query('SELECT id, name, email, workspace_id FROM "user"');
  console.log('All users:', rows);
  await p.end();
}
run().catch(console.error);
