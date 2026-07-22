require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. Register app_resource for HR > Management > Master
  // ============================================================
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('hr.management.master', 'HR', 'Management', 'Master', '👤', 'HRMasterWindow', 10)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('app_resource hr.management.master registered.');

  // ============================================================
  // 2. RPC: Get employee detail with ledger balance
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_employee_detail(p_user_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
      v_balance NUMERIC(14,2);
    BEGIN
      -- Calculate ledger balance (credit - debit = amount owed to employee)
      SELECT COALESCE(SUM(ae.credit_amount) - SUM(ae.debit_amount), 0)
      INTO v_balance
      FROM ledgers l
      JOIN accounting_entries ae ON ae.ledger_id = l.id
      WHERE l.reference_type = 'employee'
        AND l.reference_id = (SELECT id FROM employee_master WHERE user_id = p_user_id);

      SELECT json_build_object(
        'user_id', u.id,
        'full_name', u.full_name,
        'username', u.username,
        'is_active', u.is_active,
        'employee_id', e.id,
        'employee_code', e.employee_code,
        'job_title_id', e.job_title_id,
        'job_title_name', jt.title_name,
        'salary_amount', e.salary_amount,
        'salary_type', e.salary_type,
        'salary_day', e.salary_day,
        'whatsapp_number', e.whatsapp_number,
        'email', e.email,
        'joining_date', e.joining_date,
        'id_type', e.id_type,
        'state', e.state,
        'district', e.district,
        'known_languages', e.known_languages,
        'employment_status', e.employment_status,
        'branch_id', e.branch_id,
        'branch_name', br.branch_name,
        'ledger_id', l.id,
        'ledger_code', l.ledger_code,
        'ledger_balance', v_balance,
        'created_at', u.created_at
      ) INTO v_result
      FROM users u
      JOIN employee_master e ON e.user_id = u.id
      JOIN job_titles jt ON jt.id = e.job_title_id
      LEFT JOIN branches br ON br.id = e.branch_id
      LEFT JOIN ledgers l ON l.reference_type = 'employee' AND l.reference_id = e.id
      WHERE u.id = p_user_id;

      IF v_result IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee not found');
      END IF;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_employee_detail created.');

  // ============================================================
  // 3. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_employee_detail(UUID) TO anon, authenticated`);
  console.log('Permissions granted.');

  // Reload PostgREST schema cache
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
