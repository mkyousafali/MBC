require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await c.connect();

  // Check what functions exist
  const { rows } = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
    ORDER BY p.proname
  `);
  console.log('Functions in public schema:');
  rows.forEach(r => console.log(`  ${r.proname} | anon_exec=${r.anon_can_execute} | args=(${r.args})`));

  // Check if PostgREST needs a reload - notify it
  await c.query('NOTIFY pgrst, \'reload schema\'');
  console.log('\nSent schema reload notification to PostgREST.');

  await c.end();
})();
