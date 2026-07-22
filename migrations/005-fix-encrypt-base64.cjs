require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await c.connect();
  console.log('Connected.');

  // Check pgcrypto status
  const { rows: ext } = await c.query(`SELECT * FROM pg_extension WHERE extname = 'pgcrypto'`);
  console.log('pgcrypto installed:', ext.length > 0);

  // Drop and recreate with base64 encoding instead of pgcrypto
  await c.query(`DROP FUNCTION IF EXISTS rpc_create_employee_user(text,text,text,text,boolean,text,text,uuid,numeric,text,text,date,text,text,text,text,text[],uuid)`);
  console.log('Dropped rpc_create_employee_user');

  await c.query(`DROP FUNCTION IF EXISTS rpc_update_employee_user(uuid,text,text,boolean,text,text,uuid,numeric,text,text,date,text,text,text,text,text[],text,text,text,uuid)`);
  console.log('Dropped rpc_update_employee_user');

  // Recreate rpc_create_employee_user using base64
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

      -- Base64 encode the ID number
      v_id_encrypted := encode(convert_to(p_id_number, 'UTF8'), 'base64');

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
  console.log('rpc_create_employee_user recreated with base64.');

  // Recreate rpc_update_employee_user using base64
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
        v_id_encrypted := encode(convert_to(p_id_number, 'UTF8'), 'base64');
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
  console.log('rpc_update_employee_user recreated with base64.');

  // Grant
  await c.query('GRANT EXECUTE ON FUNCTION rpc_create_employee_user TO anon, authenticated');
  await c.query('GRANT EXECUTE ON FUNCTION rpc_update_employee_user TO anon, authenticated');
  console.log('Permissions granted.');

  // Force PostgREST schema reload
  await c.query("NOTIFY pgrst, 'reload schema'");
  console.log('PostgREST schema reload notified.');

  // Verify - single overload each
  const { rows: check } = await c.query(`
    SELECT p.proname, count(*) as cnt
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_%'
    GROUP BY p.proname ORDER BY p.proname
  `);
  console.log('\nFunction counts (should all be 1):');
  check.forEach(r => console.log(`  ${r.proname}: ${r.cnt}`));

  await c.end();
  console.log('\nDone.');
})();
