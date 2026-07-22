require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_user_permissions(p_user_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN (
        SELECT jsonb_agg(row_to_json(p))
        FROM (
          SELECT ar.id as resource_id, 
                 COALESCE(up.can_view, FALSE) as can_view,
                 COALESCE(up.can_add, FALSE) as can_add,
                 COALESCE(up.can_edit, FALSE) as can_edit,
                 COALESCE(up.can_delete, FALSE) as can_delete,
                 ar.resource_key, ar.main_section, ar.sub_section, ar.button_name, ar.icon
          FROM app_resources ar
          LEFT JOIN user_permissions up ON up.resource_id = ar.id AND up.user_id = p_user_id
          WHERE ar.is_active = TRUE
          ORDER BY ar.display_order
        ) p
      );
    END;
    $$
  `);
  console.log('rpc_get_user_permissions fixed.');

  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_user_permissions(UUID) TO anon, authenticated`);
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
