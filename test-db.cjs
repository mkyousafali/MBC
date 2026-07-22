require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    await client.connect();
    console.log('Connected successfully!');

    await client.query(`DROP FUNCTION IF EXISTS test_rpc(text)`);
    console.log('Dropped test_rpc function.');

    await client.query(`DROP TABLE IF EXISTS test_connection`);
    console.log('Dropped test_connection table.');

    await client.end();
    console.log('\nCleanup complete!');
  } catch (e) {
    console.error('Error:', e.message);
    await client.end();
  }
})();
