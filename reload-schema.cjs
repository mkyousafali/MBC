require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query("NOTIFY pgrst, 'reload schema'"))
  .then(() => { console.log('Schema reloaded'); c.end(); })
  .catch(e => { console.error(e); c.end(); });
