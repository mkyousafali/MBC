require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({ connectionString: process.env.DATABASE_URL });

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

(async () => {
  try {
    await client.connect();
    console.log('Connected successfully!');

    // Create super_admins table
    await client.query(`
      DROP TABLE IF EXISTS super_admins;
      CREATE TABLE super_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `);
    console.log('super_admins table created.');

    // Insert the super admin (upsert to avoid duplicates)
    const passwordHash = hashPassword('mbcadmin3692');
    await client.query(`
      INSERT INTO super_admins (username, password_hash)
      VALUES ('mbcadmin', $1)
      ON CONFLICT (username) DO UPDATE SET password_hash = $1
    `, [passwordHash]);
    console.log('Super admin user inserted. Hash:', passwordHash);

    // Create RPC function to verify super admin credentials
    await client.query(`
      CREATE OR REPLACE FUNCTION verify_super_admin(p_username text, p_password_hash text)
      RETURNS json
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        admin_id uuid;
      BEGIN
        SELECT id INTO admin_id
        FROM super_admins
        WHERE username = p_username AND password_hash = p_password_hash;

        IF admin_id IS NOT NULL THEN
          RETURN json_build_object('success', true, 'message', 'Super admin verified');
        ELSE
          RETURN json_build_object('success', false, 'message', 'Invalid credentials');
        END IF;
      END;
      $$
    `);
    console.log('verify_super_admin RPC function created.');

    // Verify it works
    const res = await client.query(`SELECT verify_super_admin('mbcadmin', $1)`, [passwordHash]);
    console.log('Verification test:', res.rows[0].verify_super_admin);

    await client.end();
    console.log('\nSetup complete!');
  } catch (e) {
    console.error('Error:', e.message);
    await client.end();
  }
})();
