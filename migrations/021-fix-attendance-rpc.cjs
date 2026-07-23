require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Drop old signature
  await client.query(`DROP FUNCTION IF EXISTS rpc_get_attendance_logs(UUID,DATE,DATE,DATE,TEXT,INT,INT)`);

  // Create with action filter
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_attendance_logs(
      p_branch_id UUID DEFAULT NULL,
      p_date DATE DEFAULT NULL,
      p_date_from DATE DEFAULT NULL,
      p_date_to DATE DEFAULT NULL,
      p_search TEXT DEFAULT NULL,
      p_action_type TEXT DEFAULT NULL,
      p_limit INT DEFAULT 100,
      p_offset INT DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_rows JSON;
      v_total BIGINT;
    BEGIN
      SELECT COUNT(*) INTO v_total
      FROM attendance_log al
      JOIN users u ON u.id = al.user_id
      JOIN branches b ON b.id = al.branch_id
      LEFT JOIN employee_master em ON em.user_id = al.user_id
      WHERE
        (p_branch_id IS NULL OR al.branch_id = p_branch_id)
        AND (p_action_type IS NULL OR al.action_type = p_action_type)
        AND (p_date IS NULL OR al.recorded_at::DATE = p_date)
        AND (p_date_from IS NULL OR al.recorded_at::DATE >= p_date_from)
        AND (p_date_to IS NULL OR al.recorded_at::DATE <= p_date_to)
        AND (p_search IS NULL OR p_search = '' OR
             u.full_name ILIKE '%' || p_search || '%' OR
             COALESCE(em.employee_code, '') ILIKE '%' || p_search || '%');

      SELECT json_agg(row_data) INTO v_rows
      FROM (
        SELECT json_build_object(
          'id', al.id,
          'user_id', al.user_id,
          'employee_name', u.full_name,
          'employee_code', COALESCE(em.employee_code, ''),
          'branch_id', al.branch_id,
          'branch_name', b.branch_name,
          'action_type', al.action_type,
          'recorded_at', al.recorded_at
        ) AS row_data
        FROM attendance_log al
        JOIN users u ON u.id = al.user_id
        JOIN branches b ON b.id = al.branch_id
        LEFT JOIN employee_master em ON em.user_id = al.user_id
        WHERE
          (p_branch_id IS NULL OR al.branch_id = p_branch_id)
          AND (p_action_type IS NULL OR al.action_type = p_action_type)
          AND (p_date IS NULL OR al.recorded_at::DATE = p_date)
          AND (p_date_from IS NULL OR al.recorded_at::DATE >= p_date_from)
          AND (p_date_to IS NULL OR al.recorded_at::DATE <= p_date_to)
          AND (p_search IS NULL OR p_search = '' OR
               u.full_name ILIKE '%' || p_search || '%' OR
               COALESCE(em.employee_code, '') ILIKE '%' || p_search || '%')
        ORDER BY al.recorded_at DESC
        LIMIT p_limit OFFSET p_offset
      ) sub;

      RETURN json_build_object(
        'success', true,
        'data', COALESCE(v_rows, '[]'::json),
        'total', v_total
      );
    END;
    $$
  `);
  console.log('rpc_get_attendance_logs updated with action filter.');

  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_attendance_logs(UUID,DATE,DATE,DATE,TEXT,TEXT,INT,INT) TO anon, authenticated`);
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
