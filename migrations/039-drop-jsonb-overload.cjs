require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  // Drop the JSONB overload that was created by migration 037
  await client.query('DROP FUNCTION IF EXISTS rpc_update_product_full(UUID, TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, JSONB, JSONB, JSONB)');
  console.log('JSONB overload dropped.');
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema reloaded.');
  await client.end();
})();
