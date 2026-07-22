require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function test() {
  await c.connect();
  const res = await c.query(`SELECT rpc_write_audit_log('test_user', 'Test User', 'update', 'user', 'uid123', 'John Doe', '{"changes":[{"field":"salary","from":"1000","to":"1200"}]}'::jsonb)`);
  console.log('Result:', JSON.stringify(res.rows));
  
  const logs = await c.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5`);
  console.log('Recent logs:', JSON.stringify(logs.rows, null, 2));
  await c.end();
}
test().catch(e => { console.error(e); c.end(); });
