require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await c.connect();
  console.log('Connected.');

  // 1. Check all overloads of rpc_create_employee_user
  const { rows } = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('rpc_create_employee_user', 'rpc_update_employee_user', 'rpc_list_employee_users')
    ORDER BY p.proname
  `);
  console.log('Function overloads found:');
  rows.forEach(r => console.log(`  ${r.proname}(${r.args})`));

  // 2. Drop ALL overloads
  for (const r of rows) {
    const dropSql = `DROP FUNCTION IF EXISTS ${r.proname}(${r.args})`;
    await c.query(dropSql);
    console.log(`Dropped: ${r.proname}`);
  }

  // 3. Recreate rpc_create_employee_user with pgp_sym_encrypt
  await c.query(`
    CREATE OR REPLACE FUNCTION rpc_create_employee_user(
      p_full_name TEXT,
      p_username TEXT,
      p_password_hash TEXT,
      p_quick_access_code_hash TEXT,
      p_is_active BOOLEAN,
      p_whatsapp_number TEXT,
      p_email TEXT,
      p_job_title_id UUID,
      p_salary_amount NUMERIC,
      p_salary_type TEXT,
      p_salary_day TEXT,
      p_joining_date DATE,
      p_id_type TEXT,
      p_id_number TEXT,
      p_state TEXT,
      p_district TEXT,
      p_known_languages TEXT[],
      p_branch_id UUID DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_user_id UUID;
      v_employee_id UUID;
      v_ledger_id UUID;
      v_employee_code TEXT;
      v_ledger_code TEXT;
      v_emp_payables_group_id UUID;
      v_id_encrypted TEXT;
      v_seq_num BIGINT;
      v_ledger_seq BIGINT;
      v_salary_type TEXT;
    BEGIN
      IF EXISTS(SELECT 1 FROM users WHERE username = lower(trim(p_username))) THEN
        RETURN json_build_object('success', false, 'message', 'Username already exists');
      END IF;

      IF NOT EXISTS(SELECT 1 FROM job_titles WHERE id = p_job_title_id AND is_active = TRUE) THEN
        RETURN json_build_object('success', false, 'message', 'Invalid or inactive job title');
      END IF;

      IF trim(p_full_name) = '' OR trim(p_username) = '' OR trim(p_password_hash) = '' OR trim(p_quick_access_code_hash) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Required fields are missing');
      END IF;

      IF trim(p_whatsapp_number) = '' OR trim(p_id_type) = '' OR trim(p_id_number) = '' OR trim(p_state) = '' OR trim(p_district) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Employee required fields are missing');
      END IF;

      IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS(SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
          RETURN json_build_object('success', false, 'message', 'Invalid or inactive branch');
        END IF;
      END IF;

      v_salary_type := COALESCE(lower(trim(p_salary_type)), 'monthly');
      IF v_salary_type NOT IN ('daily', 'weekly', 'monthly') THEN
        RETURN json_build_object('success', false, 'message', 'Invalid salary type');
      END IF;

      IF v_salary_type = 'weekly' AND (p_salary_day IS NULL OR lower(trim(p_salary_day)) NOT IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')) THEN
        RETURN json_build_object('success', false, 'message', 'Salary day is required for weekly salary type');
      END IF;

      SELECT id INTO v_emp_payables_group_id FROM account_groups WHERE group_code = 'AG-EMP-PAYABLES';
      IF v_emp_payables_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee Payables account group not found');
      END IF;

      INSERT INTO users (full_name, username, password_hash, quick_access_code_hash, is_active)
      VALUES (trim(p_full_name), lower(trim(p_username)), p_password_hash, p_quick_access_code_hash, COALESCE(p_is_active, TRUE))
      RETURNING id INTO v_user_id;

      v_seq_num := nextval('employee_code_seq');
      v_employee_code := 'EMP' || lpad(v_seq_num::TEXT, 6, '0');

      -- Use pgp_sym_encrypt instead of encrypt
      v_id_encrypted := pgp_sym_encrypt(p_id_number, v_user_id::TEXT);

      INSERT INTO employee_master (
        employee_code, user_id, job_title_id, salary_amount, salary_type, salary_day,
        whatsapp_number, email, joining_date, id_type, id_number_encrypted,
        state, district, known_languages, employment_status, branch_id
      )
      VALUES (
        v_employee_code, v_user_id, p_job_title_id, COALESCE(p_salary_amount, 0),
        v_salary_type,
        CASE WHEN v_salary_type = 'weekly' THEN lower(trim(p_salary_day)) ELSE NULL END,
        trim(p_whatsapp_number), NULLIF(trim(COALESCE(p_email, '')), ''), p_joining_date,
        trim(p_id_type), v_id_encrypted,
        trim(p_state), trim(p_district), COALESCE(p_known_languages, '{}'),
        'active', p_branch_id
      )
      RETURNING id INTO v_employee_id;

      v_ledger_seq := nextval('employee_ledger_code_seq');
      v_ledger_code := 'LED-EMP-' || lpad(v_ledger_seq::TEXT, 6, '0');

      INSERT INTO ledgers (
        ledger_code, ledger_name, account_group_id,
        reference_type, reference_id, branch_id,
        opening_balance, opening_balance_side, currency_code,
        is_system_generated, allow_manual_posting, is_active
      )
      VALUES (
        v_ledger_code, trim(p_full_name), v_emp_payables_group_id,
        'employee', v_employee_id, p_branch_id,
        0, 'credit', 'INR',
        TRUE, FALSE, TRUE
      )
      RETURNING id INTO v_ledger_id;

      RETURN json_build_object(
        'success', true,
        'message', 'Employee user created successfully',
        'user_id', v_user_id,
        'employee_id', v_employee_id,
        'employee_code', v_employee_code,
        'ledger_id', v_ledger_id,
        'ledger_code', v_ledger_code
      );

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_create_employee_user recreated.');

  // 4. Recreate rpc_update_employee_user with pgp_sym_encrypt
  await c.query(`
    CREATE OR REPLACE FUNCTION rpc_update_employee_user(
      p_user_id UUID,
      p_full_name TEXT DEFAULT NULL,
      p_username TEXT DEFAULT NULL,
      p_is_active BOOLEAN DEFAULT NULL,
      p_whatsapp_number TEXT DEFAULT NULL,
      p_email TEXT DEFAULT NULL,
      p_job_title_id UUID DEFAULT NULL,
      p_salary_amount NUMERIC DEFAULT NULL,
      p_salary_type TEXT DEFAULT NULL,
      p_salary_day TEXT DEFAULT NULL,
      p_joining_date DATE DEFAULT NULL,
      p_id_type TEXT DEFAULT NULL,
      p_id_number TEXT DEFAULT NULL,
      p_state TEXT DEFAULT NULL,
      p_district TEXT DEFAULT NULL,
      p_known_languages TEXT[] DEFAULT NULL,
      p_employment_status TEXT DEFAULT NULL,
      p_password_hash TEXT DEFAULT NULL,
      p_quick_access_code_hash TEXT DEFAULT NULL,
      p_branch_id UUID DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_employee_id UUID;
      v_old_name TEXT;
      v_id_encrypted TEXT;
      v_final_salary_type TEXT;
    BEGIN
      SELECT full_name INTO v_old_name FROM users WHERE id = p_user_id;
      IF v_old_name IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User not found');
      END IF;

      SELECT id INTO v_employee_id FROM employee_master WHERE user_id = p_user_id;
      IF v_employee_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee record not found');
      END IF;

      IF p_username IS NOT NULL THEN
        IF EXISTS(SELECT 1 FROM users WHERE username = lower(trim(p_username)) AND id != p_user_id) THEN
          RETURN json_build_object('success', false, 'message', 'Username already taken');
        END IF;
      END IF;

      IF p_job_title_id IS NOT NULL THEN
        IF NOT EXISTS(SELECT 1 FROM job_titles WHERE id = p_job_title_id AND is_active = TRUE) THEN
          RETURN json_build_object('success', false, 'message', 'Invalid or inactive job title');
        END IF;
      END IF;

      IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS(SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
          RETURN json_build_object('success', false, 'message', 'Invalid or inactive branch');
        END IF;
      END IF;

      IF p_employment_status IS NOT NULL THEN
        IF p_employment_status NOT IN ('active','inactive','on_leave','suspended','terminated','resigned') THEN
          RETURN json_build_object('success', false, 'message', 'Invalid employment status');
        END IF;
      END IF;

      IF p_salary_type IS NOT NULL THEN
        IF lower(trim(p_salary_type)) NOT IN ('daily', 'weekly', 'monthly') THEN
          RETURN json_build_object('success', false, 'message', 'Invalid salary type');
        END IF;
      END IF;

      IF p_salary_type IS NOT NULL THEN
        v_final_salary_type := lower(trim(p_salary_type));
      ELSE
        SELECT salary_type INTO v_final_salary_type FROM employee_master WHERE user_id = p_user_id;
      END IF;

      IF v_final_salary_type = 'weekly' AND p_salary_day IS NOT NULL THEN
        IF lower(trim(p_salary_day)) NOT IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday') THEN
          RETURN json_build_object('success', false, 'message', 'Invalid salary day');
        END IF;
      END IF;

      UPDATE users SET
        full_name = COALESCE(NULLIF(trim(COALESCE(p_full_name, '')), ''), full_name),
        username = COALESCE(NULLIF(lower(trim(COALESCE(p_username, ''))), ''), username),
        is_active = COALESCE(p_is_active, is_active),
        password_hash = COALESCE(NULLIF(trim(COALESCE(p_password_hash, '')), ''), password_hash),
        quick_access_code_hash = COALESCE(NULLIF(trim(COALESCE(p_quick_access_code_hash, '')), ''), quick_access_code_hash),
        updated_at = NOW()
      WHERE id = p_user_id;

      IF p_id_number IS NOT NULL AND trim(p_id_number) != '' THEN
        v_id_encrypted := pgp_sym_encrypt(p_id_number, p_user_id::TEXT);
      END IF;

      UPDATE employee_master SET
        job_title_id = COALESCE(p_job_title_id, job_title_id),
        salary_amount = COALESCE(p_salary_amount, salary_amount),
        salary_type = COALESCE(NULLIF(lower(trim(COALESCE(p_salary_type, ''))), ''), salary_type),
        salary_day = CASE
          WHEN COALESCE(NULLIF(lower(trim(COALESCE(p_salary_type, ''))), ''), salary_type) = 'weekly'
            THEN COALESCE(NULLIF(lower(trim(COALESCE(p_salary_day, ''))), ''), salary_day)
          ELSE NULL
        END,
        whatsapp_number = COALESCE(NULLIF(trim(COALESCE(p_whatsapp_number, '')), ''), whatsapp_number),
        email = CASE WHEN p_email IS NOT NULL THEN NULLIF(trim(p_email), '') ELSE email END,
        joining_date = COALESCE(p_joining_date, joining_date),
        id_type = COALESCE(NULLIF(trim(COALESCE(p_id_type, '')), ''), id_type),
        id_number_encrypted = COALESCE(v_id_encrypted, id_number_encrypted),
        state = COALESCE(NULLIF(trim(COALESCE(p_state, '')), ''), state),
        district = COALESCE(NULLIF(trim(COALESCE(p_district, '')), ''), district),
        known_languages = COALESCE(p_known_languages, known_languages),
        employment_status = COALESCE(p_employment_status, employment_status),
        branch_id = COALESCE(p_branch_id, branch_id),
        updated_at = NOW()
      WHERE user_id = p_user_id;

      IF p_full_name IS NOT NULL AND trim(p_full_name) != '' AND trim(p_full_name) != v_old_name THEN
        UPDATE ledgers SET ledger_name = trim(p_full_name), updated_at = NOW()
        WHERE reference_type = 'employee' AND reference_id = v_employee_id AND is_system_generated = TRUE;
      END IF;

      IF p_branch_id IS NOT NULL THEN
        UPDATE ledgers SET branch_id = p_branch_id, updated_at = NOW()
        WHERE reference_type = 'employee' AND reference_id = v_employee_id AND is_system_generated = TRUE;
      END IF;

      RETURN json_build_object('success', true, 'message', 'Employee user updated successfully');

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_update_employee_user recreated.');

  // 5. Recreate rpc_list_employee_users (single signature)
  await c.query(`
    CREATE OR REPLACE FUNCTION rpc_list_employee_users(
      p_search TEXT DEFAULT '',
      p_status_filter TEXT DEFAULT NULL,
      p_job_title_filter UUID DEFAULT NULL,
      p_branch_filter UUID DEFAULT NULL,
      p_sort_by TEXT DEFAULT 'created_at',
      p_sort_dir TEXT DEFAULT 'desc',
      p_limit INTEGER DEFAULT 20,
      p_offset INTEGER DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_rows JSON;
      v_total BIGINT;
      v_search TEXT;
    BEGIN
      v_search := '%' || lower(trim(COALESCE(p_search, ''))) || '%';

      IF p_sort_by NOT IN ('full_name','username','employee_code','created_at','salary_amount','joining_date') THEN
        p_sort_by := 'created_at';
      END IF;
      IF p_sort_dir NOT IN ('asc','desc') THEN
        p_sort_dir := 'desc';
      END IF;

      SELECT COUNT(*) INTO v_total
      FROM users u
      JOIN employee_master e ON e.user_id = u.id
      JOIN job_titles jt ON jt.id = e.job_title_id
      LEFT JOIN branches br ON br.id = e.branch_id
      WHERE (v_search = '%%' OR
             lower(u.full_name) LIKE v_search OR
             lower(u.username) LIKE v_search OR
             lower(e.employee_code) LIKE v_search OR
             lower(e.whatsapp_number) LIKE v_search OR
             lower(COALESCE(e.email, '')) LIKE v_search)
        AND (p_status_filter IS NULL OR e.employment_status = p_status_filter)
        AND (p_job_title_filter IS NULL OR e.job_title_id = p_job_title_filter)
        AND (p_branch_filter IS NULL OR e.branch_id = p_branch_filter);

      SELECT json_agg(row_to_json(t)) INTO v_rows
      FROM (
        SELECT
          u.id AS user_id, e.id AS employee_id, e.employee_code,
          u.full_name, u.username, e.whatsapp_number, e.email,
          e.job_title_id, jt.title_name AS job_title_name,
          e.salary_amount, e.salary_type, e.salary_day,
          e.joining_date, e.employment_status,
          e.branch_id, br.branch_name,
          u.is_active, u.created_at
        FROM users u
        JOIN employee_master e ON e.user_id = u.id
        JOIN job_titles jt ON jt.id = e.job_title_id
        LEFT JOIN branches br ON br.id = e.branch_id
        WHERE (v_search = '%%' OR
               lower(u.full_name) LIKE v_search OR
               lower(u.username) LIKE v_search OR
               lower(e.employee_code) LIKE v_search OR
               lower(e.whatsapp_number) LIKE v_search OR
               lower(COALESCE(e.email, '')) LIKE v_search)
          AND (p_status_filter IS NULL OR e.employment_status = p_status_filter)
          AND (p_job_title_filter IS NULL OR e.job_title_id = p_job_title_filter)
          AND (p_branch_filter IS NULL OR e.branch_id = p_branch_filter)
        ORDER BY
          CASE WHEN p_sort_by = 'full_name' AND p_sort_dir = 'asc' THEN u.full_name END ASC,
          CASE WHEN p_sort_by = 'full_name' AND p_sort_dir = 'desc' THEN u.full_name END DESC,
          CASE WHEN p_sort_by = 'username' AND p_sort_dir = 'asc' THEN u.username END ASC,
          CASE WHEN p_sort_by = 'username' AND p_sort_dir = 'desc' THEN u.username END DESC,
          CASE WHEN p_sort_by = 'employee_code' AND p_sort_dir = 'asc' THEN e.employee_code END ASC,
          CASE WHEN p_sort_by = 'employee_code' AND p_sort_dir = 'desc' THEN e.employee_code END DESC,
          CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN u.created_at END ASC,
          CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN u.created_at END DESC,
          CASE WHEN p_sort_by = 'salary_amount' AND p_sort_dir = 'asc' THEN e.salary_amount END ASC,
          CASE WHEN p_sort_by = 'salary_amount' AND p_sort_dir = 'desc' THEN e.salary_amount END DESC,
          CASE WHEN p_sort_by = 'joining_date' AND p_sort_dir = 'asc' THEN e.joining_date END ASC,
          CASE WHEN p_sort_by = 'joining_date' AND p_sort_dir = 'desc' THEN e.joining_date END DESC
        LIMIT p_limit OFFSET p_offset
      ) t;

      RETURN json_build_object(
        'success', true,
        'data', COALESCE(v_rows, '[]'::JSON),
        'total', v_total,
        'limit', p_limit,
        'offset', p_offset
      );
    END;
    $$
  `);
  console.log('rpc_list_employee_users recreated.');

  // 6. Grant permissions
  const rpcs = [
    'rpc_create_employee_user',
    'rpc_update_employee_user',
    'rpc_list_employee_users'
  ];
  for (const fn of rpcs) {
    await c.query(`GRANT EXECUTE ON FUNCTION ${fn} TO anon, authenticated`);
    console.log('Granted: ' + fn);
  }

  console.log('\n=== Migration 004 complete ===');
  await c.end();
})();
