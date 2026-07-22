require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    await client.connect();
    console.log('Connected.');

    // Grant execute permission on the RPC function to anon role
    await client.query(`GRANT EXECUTE ON FUNCTION verify_super_admin(text, text) TO anon`);
    console.log('Granted EXECUTE on verify_super_admin to anon.');

    // Enable RLS on super_admins table
    await client.query(`ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY`);
    console.log('RLS enabled on super_admins.');

    // No SELECT policy for anon — the SECURITY DEFINER function bypasses RLS
    // so the table data stays protected but the RPC works
    
    // Verify the function works via anon by checking it exists
    const res = await client.query(`
      SELECT routine_name, security_type 
      FROM information_schema.routines 
      WHERE routine_name = 'verify_super_admin'
    `);
    console.log('Function info:', res.rows);

    await client.end();
    console.log('Done!');
  } catch (e) {
    console.error('Error:', e.message);
    await client.end();
  }
})();
