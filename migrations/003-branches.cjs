require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. ADD phone, map_url to branches table
  // ============================================================
  await client.query(`
    ALTER TABLE branches
      ADD COLUMN IF NOT EXISTS phone TEXT NULL,
      ADD COLUMN IF NOT EXISTS map_url TEXT NULL
  `);
  console.log('branches: phone, map_url columns added.');

  // ============================================================
  // 2. ADD branch_id to employee_master
  // ============================================================
  await client.query(`
    ALTER TABLE employee_master
      ADD COLUMN IF NOT EXISTS branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL
  `);
  console.log('employee_master: branch_id column added.');

  // ============================================================
  // 3. SEED first branch
  // ============================================================
  await client.query(`
    INSERT INTO branches (branch_code, branch_name, address, state, district, phone, map_url, is_active)
    VALUES (
      'BR-001',
      'Malabar Biriyani Center',
      'Nelson Manickam Road, Mehtha Nagar, Aminijikarai',
      'Tamil Nadu',
      'Chennai',
      '+919962864358',
      'https://www.google.com/maps/place/Malabar+Biriyani+Center/@13.0687016,80.2259907,736m/data=!3m2!1e3!4b1!4m6!3m5!1s0x3a52668f517a1101:0xb81bba7689e1870!8m2!3d13.0687016!4d80.2259907!16s%2Fg%2F1t_wmsfb',
      TRUE
    )
    ON CONFLICT (branch_code) DO NOTHING
  `);
  console.log('First branch seeded.');

  // ============================================================
  // 4. Branch RPC functions
  // ============================================================

  // --- rpc_list_branches ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_branches(
      p_search TEXT DEFAULT '',
      p_active_only BOOLEAN DEFAULT FALSE,
      p_sort_by TEXT DEFAULT 'created_at',
      p_sort_dir TEXT DEFAULT 'desc',
      p_limit INTEGER DEFAULT 50,
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

      IF p_sort_by NOT IN ('branch_code','branch_name','state','district','created_at') THEN
        p_sort_by := 'created_at';
      END IF;
      IF p_sort_dir NOT IN ('asc','desc') THEN
        p_sort_dir := 'desc';
      END IF;

      SELECT COUNT(*) INTO v_total
      FROM branches
      WHERE (v_search = '%%' OR
             lower(branch_name) LIKE v_search OR
             lower(branch_code) LIKE v_search OR
             lower(COALESCE(address, '')) LIKE v_search OR
             lower(COALESCE(district, '')) LIKE v_search OR
             lower(COALESCE(state, '')) LIKE v_search)
        AND (NOT p_active_only OR is_active = TRUE);

      SELECT json_agg(row_to_json(t)) INTO v_rows
      FROM (
        SELECT id, branch_code, branch_name, address, state, district,
               gstin, phone, map_url, is_active, created_at, updated_at
        FROM branches
        WHERE (v_search = '%%' OR
               lower(branch_name) LIKE v_search OR
               lower(branch_code) LIKE v_search OR
               lower(COALESCE(address, '')) LIKE v_search OR
               lower(COALESCE(district, '')) LIKE v_search OR
               lower(COALESCE(state, '')) LIKE v_search)
          AND (NOT p_active_only OR is_active = TRUE)
        ORDER BY
          CASE WHEN p_sort_by = 'branch_code' AND p_sort_dir = 'asc' THEN branch_code END ASC,
          CASE WHEN p_sort_by = 'branch_code' AND p_sort_dir = 'desc' THEN branch_code END DESC,
          CASE WHEN p_sort_by = 'branch_name' AND p_sort_dir = 'asc' THEN branch_name END ASC,
          CASE WHEN p_sort_by = 'branch_name' AND p_sort_dir = 'desc' THEN branch_name END DESC,
          CASE WHEN p_sort_by = 'state' AND p_sort_dir = 'asc' THEN state END ASC,
          CASE WHEN p_sort_by = 'state' AND p_sort_dir = 'desc' THEN state END DESC,
          CASE WHEN p_sort_by = 'district' AND p_sort_dir = 'asc' THEN district END ASC,
          CASE WHEN p_sort_by = 'district' AND p_sort_dir = 'desc' THEN district END DESC,
          CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN created_at END ASC,
          CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN created_at END DESC
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
  console.log('rpc_list_branches created.');

  // --- rpc_get_branch ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_branch(p_branch_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
    BEGIN
      SELECT json_build_object(
        'id', id, 'branch_code', branch_code, 'branch_name', branch_name,
        'address', address, 'state', state, 'district', district,
        'gstin', gstin, 'phone', phone, 'map_url', map_url,
        'is_active', is_active, 'created_at', created_at
      ) INTO v_result
      FROM branches WHERE id = p_branch_id;

      IF v_result IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Branch not found');
      END IF;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_branch created.');

  // --- rpc_create_branch ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_create_branch(
      p_branch_code TEXT,
      p_branch_name TEXT,
      p_address TEXT DEFAULT NULL,
      p_state TEXT DEFAULT NULL,
      p_district TEXT DEFAULT NULL,
      p_gstin TEXT DEFAULT NULL,
      p_phone TEXT DEFAULT NULL,
      p_map_url TEXT DEFAULT NULL,
      p_is_active BOOLEAN DEFAULT TRUE
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_id UUID;
    BEGIN
      IF trim(p_branch_code) = '' OR trim(p_branch_name) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Branch code and name are required');
      END IF;

      IF EXISTS(SELECT 1 FROM branches WHERE branch_code = upper(trim(p_branch_code))) THEN
        RETURN json_build_object('success', false, 'message', 'Branch code already exists');
      END IF;

      INSERT INTO branches (branch_code, branch_name, address, state, district, gstin, phone, map_url, is_active)
      VALUES (
        upper(trim(p_branch_code)), trim(p_branch_name),
        NULLIF(trim(COALESCE(p_address, '')), ''),
        NULLIF(trim(COALESCE(p_state, '')), ''),
        NULLIF(trim(COALESCE(p_district, '')), ''),
        NULLIF(trim(COALESCE(p_gstin, '')), ''),
        NULLIF(trim(COALESCE(p_phone, '')), ''),
        NULLIF(trim(COALESCE(p_map_url, '')), ''),
        COALESCE(p_is_active, TRUE)
      )
      RETURNING id INTO v_id;

      RETURN json_build_object('success', true, 'message', 'Branch created successfully', 'branch_id', v_id);

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_create_branch created.');

  // --- rpc_update_branch ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_update_branch(
      p_branch_id UUID,
      p_branch_name TEXT DEFAULT NULL,
      p_address TEXT DEFAULT NULL,
      p_state TEXT DEFAULT NULL,
      p_district TEXT DEFAULT NULL,
      p_gstin TEXT DEFAULT NULL,
      p_phone TEXT DEFAULT NULL,
      p_map_url TEXT DEFAULT NULL,
      p_is_active BOOLEAN DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM branches WHERE id = p_branch_id) THEN
        RETURN json_build_object('success', false, 'message', 'Branch not found');
      END IF;

      UPDATE branches SET
        branch_name = COALESCE(NULLIF(trim(COALESCE(p_branch_name, '')), ''), branch_name),
        address = CASE WHEN p_address IS NOT NULL THEN NULLIF(trim(p_address), '') ELSE address END,
        state = CASE WHEN p_state IS NOT NULL THEN NULLIF(trim(p_state), '') ELSE state END,
        district = CASE WHEN p_district IS NOT NULL THEN NULLIF(trim(p_district), '') ELSE district END,
        gstin = CASE WHEN p_gstin IS NOT NULL THEN NULLIF(trim(p_gstin), '') ELSE gstin END,
        phone = CASE WHEN p_phone IS NOT NULL THEN NULLIF(trim(p_phone), '') ELSE phone END,
        map_url = CASE WHEN p_map_url IS NOT NULL THEN NULLIF(trim(p_map_url), '') ELSE map_url END,
        is_active = COALESCE(p_is_active, is_active),
        updated_at = NOW()
      WHERE id = p_branch_id;

      RETURN json_build_object('success', true, 'message', 'Branch updated successfully');

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_update_branch created.');

  // --- rpc_get_active_branches (for dropdowns) ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_active_branches()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_rows JSON;
    BEGIN
      SELECT json_agg(row_to_json(t)) INTO v_rows
      FROM (
        SELECT id, branch_code, branch_name, district, state
        FROM branches
        WHERE is_active = TRUE
        ORDER BY branch_name ASC
      ) t;

      RETURN COALESCE(v_rows, '[]'::JSON);
    END;
    $$
  `);
  console.log('rpc_get_active_branches created.');

  // ============================================================
  // 5. UPDATE employee RPCs to include branch_id
  // ============================================================

  // Drop old create signature (has salary fields from migration 002)
  await client.query(`
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

      -- Validate branch if provided
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

      v_id_encrypted := encode(encrypt(convert_to(p_id_number, 'UTF8'), convert_to(v_user_id::TEXT, 'UTF8'), 'aes'), 'base64');

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
  console.log('rpc_create_employee_user updated with branch_id.');

  // --- Update rpc_update_employee_user ---
  await client.query(`
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
        v_id_encrypted := encode(encrypt(convert_to(p_id_number, 'UTF8'), convert_to(p_user_id::TEXT, 'UTF8'), 'aes'), 'base64');
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
        UPDATE ledgers SET
          ledger_name = trim(p_full_name),
          updated_at = NOW()
        WHERE reference_type = 'employee' AND reference_id = v_employee_id AND is_system_generated = TRUE;
      END IF;

      -- Update ledger branch if branch changed
      IF p_branch_id IS NOT NULL THEN
        UPDATE ledgers SET
          branch_id = p_branch_id,
          updated_at = NOW()
        WHERE reference_type = 'employee' AND reference_id = v_employee_id AND is_system_generated = TRUE;
      END IF;

      RETURN json_build_object('success', true, 'message', 'Employee user updated successfully');

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_update_employee_user updated with branch_id.');

  // --- Update rpc_get_employee_user ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_employee_user(p_user_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
    BEGIN
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
        'created_at', u.created_at
      ) INTO v_result
      FROM users u
      JOIN employee_master e ON e.user_id = u.id
      JOIN job_titles jt ON jt.id = e.job_title_id
      LEFT JOIN branches br ON br.id = e.branch_id
      LEFT JOIN ledgers l ON l.reference_type = 'employee' AND l.reference_id = e.id
      WHERE u.id = p_user_id;

      IF v_result IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User not found');
      END IF;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_employee_user updated with branch.');

  // --- Update rpc_list_employee_users ---
  await client.query(`
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
          u.id AS user_id,
          e.id AS employee_id,
          e.employee_code,
          u.full_name,
          u.username,
          e.whatsapp_number,
          e.email,
          e.job_title_id,
          jt.title_name AS job_title_name,
          e.salary_amount,
          e.salary_type,
          e.salary_day,
          e.joining_date,
          e.employment_status,
          e.branch_id,
          br.branch_name,
          u.is_active,
          u.created_at
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
  console.log('rpc_list_employee_users updated with branch filter.');

  // ============================================================
  // 6. GRANT PERMISSIONS
  // ============================================================
  const rpcs = [
    'rpc_list_branches',
    'rpc_get_branch',
    'rpc_create_branch',
    'rpc_update_branch',
    'rpc_get_active_branches',
    'rpc_create_employee_user',
    'rpc_update_employee_user',
    'rpc_get_employee_user',
    'rpc_list_employee_users'
  ];
  for (const fn of rpcs) {
    await client.query(`GRANT EXECUTE ON FUNCTION ${fn} TO anon, authenticated`);
  }
  console.log('Permissions granted.');

  console.log('\\n=== Migration 003 complete ===');
  await client.end();
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
