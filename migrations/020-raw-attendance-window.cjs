require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Register resource in app_resources
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('hr.reports.raw_attendance', 'HR', 'Reports', 'Raw Attendance', '📋', 'RawAttendanceWindow', 30)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('app_resources entry created.');

  // 2. RPC to fetch attendance logs with filters + pagination
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_attendance_logs(
      p_branch_id UUID DEFAULT NULL,
      p_date DATE DEFAULT NULL,
      p_date_from DATE DEFAULT NULL,
      p_date_to DATE DEFAULT NULL,
      p_search TEXT DEFAULT NULL,
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
      -- Count total matching records
      SELECT COUNT(*) INTO v_total
      FROM attendance_log al
      JOIN users u ON u.id = al.user_id
      JOIN branches b ON b.id = al.branch_id
      LEFT JOIN employee_master em ON em.user_id = al.user_id
      WHERE
        (p_branch_id IS NULL OR al.branch_id = p_branch_id)
        AND (p_date IS NULL OR al.recorded_at::DATE = p_date)
        AND (p_date_from IS NULL OR al.recorded_at::DATE >= p_date_from)
        AND (p_date_to IS NULL OR al.recorded_at::DATE <= p_date_to)
        AND (p_search IS NULL OR p_search = '' OR
             u.full_name ILIKE '%' || p_search || '%' OR
             em.employee_code ILIKE '%' || p_search || '%');

      -- Fetch paginated rows
      SELECT json_agg(row_data) INTO v_rows
      FROM (
        SELECT json_build_object(
          'id', al.id,
          'user_id', al.user_id,
          'employee_name', u.full_name,
          'employee_code', em.employee_code,
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
          AND (p_date IS NULL OR al.recorded_at::DATE = p_date)
          AND (p_date_from IS NULL OR al.recorded_at::DATE >= p_date_from)
          AND (p_date_to IS NULL OR al.recorded_at::DATE <= p_date_to)
          AND (p_search IS NULL OR p_search = '' OR
               u.full_name ILIKE '%' || p_search || '%' OR
               em.employee_code ILIKE '%' || p_search || '%')
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
  console.log('rpc_get_attendance_logs created.');

  // 3. RPC to get branches list for filter dropdown
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_branches_list()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_data), '[]'::json)
        FROM (
          SELECT json_build_object('id', id, 'branch_name', branch_name) AS row_data
          FROM branches WHERE is_active = TRUE
          ORDER BY branch_name
        ) sub
      );
    END;
    $$
  `);
  console.log('rpc_get_branches_list created.');

  // 4. Grant permissions
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_attendance_logs(UUID, DATE, DATE, DATE, TEXT, INT, INT) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_branches_list() TO anon, authenticated`);
  console.log('Permissions granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded. Done.');

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
