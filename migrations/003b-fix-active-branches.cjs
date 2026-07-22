require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await c.connect();
  await c.query(`
    CREATE OR REPLACE FUNCTION rpc_get_active_branches()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE v_rows JSON;
    BEGIN
      SELECT json_agg(row_to_json(t)) INTO v_rows
      FROM (
        SELECT id, branch_code, branch_name, address, district, state
        FROM branches
        WHERE is_active = TRUE
        ORDER BY branch_name ASC
      ) t;
      RETURN COALESCE(v_rows, '[]'::JSON);
    END;
    $$
  `);
  console.log('rpc_get_active_branches updated with address');
  await c.query('GRANT EXECUTE ON FUNCTION rpc_get_active_branches TO anon, authenticated');
  console.log('granted');
  await c.end();
})();
