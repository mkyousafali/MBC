require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // Enable extensions
  // ============================================================
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  console.log('pgcrypto extension enabled.');

  // ============================================================
  // 1. BRANCHES
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      branch_code     TEXT NOT NULL UNIQUE,
      branch_name     TEXT NOT NULL,
      address         TEXT NULL,
      state           TEXT NULL,
      district        TEXT NULL,
      gstin           TEXT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('branches table created.');

  // ============================================================
  // 2. FINANCIAL YEARS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS financial_years (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      financial_year_code TEXT NOT NULL UNIQUE,
      start_date          DATE NOT NULL,
      end_date            DATE NOT NULL,
      is_current          BOOLEAN NOT NULL DEFAULT FALSE,
      is_closed           BOOLEAN NOT NULL DEFAULT FALSE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('financial_years table created.');

  // ============================================================
  // 3. USERS (drop old if exists, preserve super_admins)
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name               TEXT NOT NULL,
      username                TEXT NOT NULL UNIQUE,
      password_hash           TEXT NOT NULL,
      quick_access_code_hash  TEXT NOT NULL,
      is_active               BOOLEAN NOT NULL DEFAULT TRUE,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('users table created.');

  // ============================================================
  // 4. JOB TITLES
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS job_titles (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title_code      TEXT NOT NULL UNIQUE,
      title_name      TEXT NOT NULL UNIQUE,
      description     TEXT NULL,
      department_name TEXT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      display_order   INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('job_titles table created.');

  // ============================================================
  // 5. EMPLOYEE MASTER
  // ============================================================

  // Create sequence for employee codes
  await client.query(`CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS employee_master (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_code         TEXT NOT NULL UNIQUE,
      user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
      job_title_id          UUID NOT NULL REFERENCES job_titles(id) ON DELETE RESTRICT,
      monthly_salary        NUMERIC(14,2) NOT NULL DEFAULT 0,
      whatsapp_number       TEXT NOT NULL,
      email                 TEXT NULL,
      joining_date          DATE NOT NULL,
      id_type               TEXT NOT NULL,
      id_number_encrypted   TEXT NOT NULL,
      state                 TEXT NOT NULL,
      district              TEXT NOT NULL,
      known_languages       TEXT[] NOT NULL DEFAULT '{}',
      employment_status     TEXT NOT NULL DEFAULT 'active'
                            CHECK (employment_status IN ('active','inactive','on_leave','suspended','terminated','resigned')),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('employee_master table created.');

  // ============================================================
  // 6. ACCOUNT GROUPS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS account_groups (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_code        TEXT NOT NULL UNIQUE,
      group_name        TEXT NOT NULL,
      parent_group_id   UUID NULL REFERENCES account_groups(id) ON DELETE RESTRICT,
      account_category  TEXT NOT NULL CHECK (account_category IN ('asset','liability','equity','income','expense')),
      normal_balance    TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
      is_system         BOOLEAN NOT NULL DEFAULT FALSE,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('account_groups table created.');

  // ============================================================
  // 7. LEDGERS
  // ============================================================

  // Create sequence for employee ledger codes
  await client.query(`CREATE SEQUENCE IF NOT EXISTS employee_ledger_code_seq START 1`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_code           TEXT NOT NULL UNIQUE,
      ledger_name           TEXT NOT NULL,
      account_group_id      UUID NOT NULL REFERENCES account_groups(id) ON DELETE RESTRICT,
      reference_type        TEXT NULL,
      reference_id          UUID NULL,
      branch_id             UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
      opening_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
      opening_balance_side  TEXT NULL CHECK (opening_balance_side IN ('debit','credit')),
      currency_code         TEXT NOT NULL DEFAULT 'INR',
      is_system_generated   BOOLEAN NOT NULL DEFAULT FALSE,
      allow_manual_posting  BOOLEAN NOT NULL DEFAULT TRUE,
      is_active             BOOLEAN NOT NULL DEFAULT TRUE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(reference_type, reference_id)
    )
  `);
  console.log('ledgers table created.');

  // ============================================================
  // 8. ACCOUNTING TRANSACTIONS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS accounting_transactions (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      voucher_number    TEXT NOT NULL UNIQUE,
      voucher_type      TEXT NOT NULL CHECK (voucher_type IN (
        'journal','payment','receipt','contra','sales','purchase',
        'credit_note','debit_note','salary_accrual','salary_payment','expense'
      )),
      financial_year_id UUID NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
      branch_id         UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
      transaction_date  DATE NOT NULL,
      reference_type    TEXT NULL,
      reference_id      UUID NULL,
      description       TEXT NULL,
      status            TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','reversed','cancelled')),
      created_by        UUID NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('accounting_transactions table created.');

  // ============================================================
  // 9. ACCOUNTING ENTRIES
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS accounting_entries (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id  UUID NOT NULL REFERENCES accounting_transactions(id) ON DELETE CASCADE,
      ledger_id       UUID NOT NULL REFERENCES ledgers(id) ON DELETE RESTRICT,
      debit_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
      credit_amount   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
      description     TEXT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_entry_one_side CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0)
      )
    )
  `);
  console.log('accounting_entries table created.');

  // ============================================================
  // 10. INDEXES
  // ============================================================
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
    'CREATE INDEX IF NOT EXISTS idx_users_full_name ON users(full_name)',
    'CREATE INDEX IF NOT EXISTS idx_employee_master_employee_code ON employee_master(employee_code)',
    'CREATE INDEX IF NOT EXISTS idx_employee_master_user_id ON employee_master(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_employee_master_job_title_id ON employee_master(job_title_id)',
    'CREATE INDEX IF NOT EXISTS idx_employee_master_employment_status ON employee_master(employment_status)',
    'CREATE INDEX IF NOT EXISTS idx_employee_master_whatsapp ON employee_master(whatsapp_number)',
    'CREATE INDEX IF NOT EXISTS idx_employee_master_email ON employee_master(email)',
    'CREATE INDEX IF NOT EXISTS idx_ledgers_ledger_code ON ledgers(ledger_code)',
    'CREATE INDEX IF NOT EXISTS idx_ledgers_reference ON ledgers(reference_type, reference_id)',
    'CREATE INDEX IF NOT EXISTS idx_acctxn_date ON accounting_transactions(transaction_date)',
    'CREATE INDEX IF NOT EXISTS idx_acctxn_fy ON accounting_transactions(financial_year_id)',
    'CREATE INDEX IF NOT EXISTS idx_acctxn_branch ON accounting_transactions(branch_id)',
    'CREATE INDEX IF NOT EXISTS idx_accentry_txn ON accounting_entries(transaction_id)',
    'CREATE INDEX IF NOT EXISTS idx_accentry_ledger ON accounting_entries(ledger_id)',
  ];
  for (const idx of indexes) {
    await client.query(idx);
  }
  console.log('All indexes created.');

  // ============================================================
  // 11. SEED JOB TITLES
  // ============================================================
  const jobTitles = [
    ['JT001', 'Restaurant Manager', 'Oversees overall restaurant operations', 'Management'],
    ['JT002', 'Assistant Restaurant Manager', 'Assists restaurant manager', 'Management'],
    ['JT003', 'Branch Manager', 'Manages a specific branch', 'Management'],
    ['JT004', 'Operations Manager', 'Manages operations across branches', 'Management'],
    ['JT005', 'Operations Supervisor', 'Supervises daily operations', 'Operations'],
    ['JT006', 'Shift Supervisor', 'Manages shifts', 'Operations'],
    ['JT007', 'HR Manager', 'Manages human resources', 'HR'],
    ['JT008', 'HR Assistant', 'Assists HR manager', 'HR'],
    ['JT009', 'Accountant', 'Handles accounting', 'Finance'],
    ['JT010', 'Assistant Accountant', 'Assists accountant', 'Finance'],
    ['JT011', 'Cashier', 'Handles cash transactions', 'Finance'],
    ['JT012', 'Head Chef', 'Leads the kitchen', 'Kitchen'],
    ['JT013', 'Biriyani Chef', 'Specializes in biriyani', 'Kitchen'],
    ['JT014', 'Assistant Chef', 'Assists head chef', 'Kitchen'],
    ['JT015', 'Kitchen Supervisor', 'Supervises kitchen staff', 'Kitchen'],
    ['JT016', 'Kitchen Helper', 'Assists in kitchen tasks', 'Kitchen'],
    ['JT017', 'Preparation Staff', 'Prepares ingredients', 'Kitchen'],
    ['JT018', 'Bakery Chef', 'Leads bakery section', 'Kitchen'],
    ['JT019', 'Bakery Assistant', 'Assists bakery chef', 'Kitchen'],
    ['JT020', 'Waiter', 'Serves customers', 'Service'],
    ['JT021', 'Captain', 'Senior waiter / section lead', 'Service'],
    ['JT022', 'Counter Staff', 'Manages counter', 'Service'],
    ['JT023', 'Packing Staff', 'Packs orders', 'Service'],
    ['JT024', 'Delivery Coordinator', 'Coordinates deliveries', 'Delivery'],
    ['JT025', 'Delivery Staff', 'Delivers orders', 'Delivery'],
    ['JT026', 'Purchasing Officer', 'Handles purchasing', 'Procurement'],
    ['JT027', 'Storekeeper', 'Manages store inventory', 'Procurement'],
    ['JT028', 'Inventory Controller', 'Controls inventory', 'Procurement'],
    ['JT029', 'Receiving Staff', 'Receives goods', 'Procurement'],
    ['JT030', 'Customer Service Staff', 'Handles customer service', 'Service'],
    ['JT031', 'Cleaner', 'Cleaning and sanitation', 'Support'],
    ['JT032', 'Dishwasher', 'Washes dishes', 'Support'],
    ['JT033', 'Maintenance Technician', 'Maintains equipment', 'Support'],
    ['JT034', 'Security Guard', 'Provides security', 'Support'],
    ['JT035', 'Office Assistant', 'Assists in office work', 'Admin'],
    ['JT036', 'IT Support', 'IT support and maintenance', 'Admin'],
  ];

  for (let i = 0; i < jobTitles.length; i++) {
    const [code, name, desc, dept] = jobTitles[i];
    await client.query(`
      INSERT INTO job_titles (title_code, title_name, description, department_name, display_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (title_code) DO NOTHING
    `, [code, name, desc, dept, i + 1]);
  }
  console.log(`Seeded ${jobTitles.length} job titles.`);

  // ============================================================
  // 12. SEED ACCOUNT GROUPS
  // ============================================================
  // Insert parent groups first, then children
  const parentGroups = [
    ['AG-ASSETS', 'Assets', null, 'asset', 'debit', true],
    ['AG-LIABILITIES', 'Liabilities', null, 'liability', 'credit', true],
    ['AG-EQUITY', 'Equity', null, 'equity', 'credit', true],
    ['AG-INCOME', 'Income', null, 'income', 'credit', true],
    ['AG-EXPENSES', 'Expenses', null, 'expense', 'debit', true],
  ];

  for (const [code, name, _, cat, bal, sys] of parentGroups) {
    await client.query(`
      INSERT INTO account_groups (group_code, group_name, parent_group_id, account_category, normal_balance, is_system)
      VALUES ($1, $2, NULL, $3, $4, $5)
      ON CONFLICT (group_code) DO NOTHING
    `, [code, name, cat, bal, sys]);
  }

  // Helper to get parent id
  async function getGroupId(code) {
    const r = await client.query(`SELECT id FROM account_groups WHERE group_code = $1`, [code]);
    return r.rows[0]?.id;
  }

  const childGroups = [
    // Under Assets
    ['AG-CURRENT-ASSETS', 'Current Assets', 'AG-ASSETS', 'asset', 'debit'],
    ['AG-CASH-EQUIV', 'Cash and Cash Equivalents', 'AG-ASSETS', 'asset', 'debit'],
    ['AG-BANK-ACCOUNTS', 'Bank Accounts', 'AG-ASSETS', 'asset', 'debit'],
    ['AG-ACCT-RECEIVABLE', 'Accounts Receivable', 'AG-ASSETS', 'asset', 'debit'],
    ['AG-INVENTORY', 'Inventory', 'AG-ASSETS', 'asset', 'debit'],
    ['AG-FIXED-ASSETS', 'Fixed Assets', 'AG-ASSETS', 'asset', 'debit'],
    // Under Liabilities
    ['AG-CURRENT-LIAB', 'Current Liabilities', 'AG-LIABILITIES', 'liability', 'credit'],
    ['AG-ACCT-PAYABLE', 'Accounts Payable', 'AG-LIABILITIES', 'liability', 'credit'],
    ['AG-EMP-PAYABLES', 'Employee Payables', 'AG-LIABILITIES', 'liability', 'credit'],
    ['AG-GST-PAYABLE', 'GST Payable', 'AG-LIABILITIES', 'liability', 'credit'],
    ['AG-OTHER-STATUTORY', 'Other Statutory Payables', 'AG-LIABILITIES', 'liability', 'credit'],
    // Under Equity
    ['AG-CAPITAL', 'Capital Account', 'AG-EQUITY', 'equity', 'credit'],
    ['AG-RETAINED-EARNINGS', 'Retained Earnings', 'AG-EQUITY', 'equity', 'credit'],
    // Under Income
    ['AG-SALES-INCOME', 'Sales Income', 'AG-INCOME', 'income', 'credit'],
    ['AG-OTHER-INCOME', 'Other Income', 'AG-INCOME', 'income', 'credit'],
    // Under Expenses
    ['AG-COGS', 'Cost of Goods Sold', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-SALARY-WAGES', 'Salary and Wages', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-RENT', 'Rent Expense', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-UTILITY', 'Utility Expense', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-DELIVERY', 'Delivery Expense', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-REPAIRS', 'Repairs and Maintenance', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-ADMIN', 'Administrative Expense', 'AG-EXPENSES', 'expense', 'debit'],
    ['AG-OTHER-EXPENSE', 'Other Expense', 'AG-EXPENSES', 'expense', 'debit'],
  ];

  for (const [code, name, parentCode, cat, bal] of childGroups) {
    const parentId = await getGroupId(parentCode);
    await client.query(`
      INSERT INTO account_groups (group_code, group_name, parent_group_id, account_category, normal_balance, is_system)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      ON CONFLICT (group_code) DO NOTHING
    `, [code, name, parentId, cat, bal]);
  }
  console.log('Seeded account groups.');

  // ============================================================
  // 13. RLS
  // ============================================================
  const tables = [
    'users', 'employee_master', 'job_titles', 'account_groups',
    'ledgers', 'financial_years', 'branches',
    'accounting_transactions', 'accounting_entries'
  ];
  for (const t of tables) {
    await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
  console.log('RLS enabled on all tables.');

  // ============================================================
  // 14. RPC FUNCTIONS
  // ============================================================

  // --- rpc_get_active_job_titles ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_active_job_titles()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT json_agg(row_to_json(t))
        FROM (
          SELECT id, title_code, title_name, department_name, display_order
          FROM job_titles
          WHERE is_active = TRUE
          ORDER BY display_order, title_name
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_get_active_job_titles created.');

  // --- rpc_check_username_availability ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_check_username_availability(p_username TEXT)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(SELECT 1 FROM users WHERE username = lower(trim(p_username))) INTO v_exists;
      RETURN json_build_object('available', NOT v_exists);
    END;
    $$
  `);
  console.log('rpc_check_username_availability created.');

  // --- rpc_generate_quick_access_code ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_generate_quick_access_code()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_code TEXT;
    BEGIN
      v_code := lpad(floor(random() * 1000000)::TEXT, 6, '0');
      RETURN json_build_object('code', v_code);
    END;
    $$
  `);
  console.log('rpc_generate_quick_access_code created.');

  // --- rpc_create_employee_user ---
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
      p_monthly_salary NUMERIC,
      p_joining_date DATE,
      p_id_type TEXT,
      p_id_number TEXT,
      p_state TEXT,
      p_district TEXT,
      p_known_languages TEXT[]
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
    BEGIN
      -- Validate username uniqueness
      IF EXISTS(SELECT 1 FROM users WHERE username = lower(trim(p_username))) THEN
        RETURN json_build_object('success', false, 'message', 'Username already exists');
      END IF;

      -- Validate job title exists and is active
      IF NOT EXISTS(SELECT 1 FROM job_titles WHERE id = p_job_title_id AND is_active = TRUE) THEN
        RETURN json_build_object('success', false, 'message', 'Invalid or inactive job title');
      END IF;

      -- Validate required fields
      IF trim(p_full_name) = '' OR trim(p_username) = '' OR trim(p_password_hash) = '' OR trim(p_quick_access_code_hash) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Required fields are missing');
      END IF;

      IF trim(p_whatsapp_number) = '' OR trim(p_id_type) = '' OR trim(p_id_number) = '' OR trim(p_state) = '' OR trim(p_district) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Employee required fields are missing');
      END IF;

      -- Find Employee Payables group
      SELECT id INTO v_emp_payables_group_id FROM account_groups WHERE group_code = 'AG-EMP-PAYABLES';
      IF v_emp_payables_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee Payables account group not found');
      END IF;

      -- 1. Create user
      INSERT INTO users (full_name, username, password_hash, quick_access_code_hash, is_active)
      VALUES (trim(p_full_name), lower(trim(p_username)), p_password_hash, p_quick_access_code_hash, COALESCE(p_is_active, TRUE))
      RETURNING id INTO v_user_id;

      -- 2. Generate employee code
      v_seq_num := nextval('employee_code_seq');
      v_employee_code := 'EMP' || lpad(v_seq_num::TEXT, 6, '0');

      -- 3. Encrypt government ID
      v_id_encrypted := encode(encrypt(convert_to(p_id_number, 'UTF8'), convert_to(v_user_id::TEXT, 'UTF8'), 'aes'), 'base64');

      -- 4. Create employee_master
      INSERT INTO employee_master (
        employee_code, user_id, job_title_id, monthly_salary,
        whatsapp_number, email, joining_date, id_type, id_number_encrypted,
        state, district, known_languages, employment_status
      )
      VALUES (
        v_employee_code, v_user_id, p_job_title_id, COALESCE(p_monthly_salary, 0),
        trim(p_whatsapp_number), NULLIF(trim(COALESCE(p_email, '')), ''), p_joining_date,
        trim(p_id_type), v_id_encrypted,
        trim(p_state), trim(p_district), COALESCE(p_known_languages, '{}'),
        'active'
      )
      RETURNING id INTO v_employee_id;

      -- 5. Generate ledger code
      v_ledger_seq := nextval('employee_ledger_code_seq');
      v_ledger_code := 'LED-EMP-' || lpad(v_ledger_seq::TEXT, 6, '0');

      -- 6. Create employee ledger
      INSERT INTO ledgers (
        ledger_code, ledger_name, account_group_id,
        reference_type, reference_id,
        opening_balance, opening_balance_side, currency_code,
        is_system_generated, allow_manual_posting, is_active
      )
      VALUES (
        v_ledger_code, trim(p_full_name), v_emp_payables_group_id,
        'employee', v_employee_id,
        0, 'credit', 'INR',
        TRUE, FALSE, TRUE
      )
      RETURNING id INTO v_ledger_id;

      -- Return result
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
  console.log('rpc_create_employee_user created.');

  // --- rpc_update_employee_user ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_update_employee_user(
      p_user_id UUID,
      p_full_name TEXT DEFAULT NULL,
      p_username TEXT DEFAULT NULL,
      p_is_active BOOLEAN DEFAULT NULL,
      p_whatsapp_number TEXT DEFAULT NULL,
      p_email TEXT DEFAULT NULL,
      p_job_title_id UUID DEFAULT NULL,
      p_monthly_salary NUMERIC DEFAULT NULL,
      p_joining_date DATE DEFAULT NULL,
      p_id_type TEXT DEFAULT NULL,
      p_id_number TEXT DEFAULT NULL,
      p_state TEXT DEFAULT NULL,
      p_district TEXT DEFAULT NULL,
      p_known_languages TEXT[] DEFAULT NULL,
      p_employment_status TEXT DEFAULT NULL,
      p_password_hash TEXT DEFAULT NULL,
      p_quick_access_code_hash TEXT DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_employee_id UUID;
      v_old_name TEXT;
      v_id_encrypted TEXT;
    BEGIN
      -- Verify user exists
      SELECT full_name INTO v_old_name FROM users WHERE id = p_user_id;
      IF v_old_name IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User not found');
      END IF;

      -- Get employee id
      SELECT id INTO v_employee_id FROM employee_master WHERE user_id = p_user_id;
      IF v_employee_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee record not found');
      END IF;

      -- Check username uniqueness if changing
      IF p_username IS NOT NULL THEN
        IF EXISTS(SELECT 1 FROM users WHERE username = lower(trim(p_username)) AND id != p_user_id) THEN
          RETURN json_build_object('success', false, 'message', 'Username already taken');
        END IF;
      END IF;

      -- Validate job title if changing
      IF p_job_title_id IS NOT NULL THEN
        IF NOT EXISTS(SELECT 1 FROM job_titles WHERE id = p_job_title_id AND is_active = TRUE) THEN
          RETURN json_build_object('success', false, 'message', 'Invalid or inactive job title');
        END IF;
      END IF;

      -- Validate employment status if changing
      IF p_employment_status IS NOT NULL THEN
        IF p_employment_status NOT IN ('active','inactive','on_leave','suspended','terminated','resigned') THEN
          RETURN json_build_object('success', false, 'message', 'Invalid employment status');
        END IF;
      END IF;

      -- Update users table
      UPDATE users SET
        full_name = COALESCE(NULLIF(trim(COALESCE(p_full_name, '')), ''), full_name),
        username = COALESCE(NULLIF(lower(trim(COALESCE(p_username, ''))), ''), username),
        is_active = COALESCE(p_is_active, is_active),
        password_hash = COALESCE(NULLIF(trim(COALESCE(p_password_hash, '')), ''), password_hash),
        quick_access_code_hash = COALESCE(NULLIF(trim(COALESCE(p_quick_access_code_hash, '')), ''), quick_access_code_hash),
        updated_at = NOW()
      WHERE id = p_user_id;

      -- Encrypt ID if provided
      IF p_id_number IS NOT NULL AND trim(p_id_number) != '' THEN
        v_id_encrypted := encode(encrypt(convert_to(p_id_number, 'UTF8'), convert_to(p_user_id::TEXT, 'UTF8'), 'aes'), 'base64');
      END IF;

      -- Update employee_master
      UPDATE employee_master SET
        job_title_id = COALESCE(p_job_title_id, job_title_id),
        monthly_salary = COALESCE(p_monthly_salary, monthly_salary),
        whatsapp_number = COALESCE(NULLIF(trim(COALESCE(p_whatsapp_number, '')), ''), whatsapp_number),
        email = CASE WHEN p_email IS NOT NULL THEN NULLIF(trim(p_email), '') ELSE email END,
        joining_date = COALESCE(p_joining_date, joining_date),
        id_type = COALESCE(NULLIF(trim(COALESCE(p_id_type, '')), ''), id_type),
        id_number_encrypted = COALESCE(v_id_encrypted, id_number_encrypted),
        state = COALESCE(NULLIF(trim(COALESCE(p_state, '')), ''), state),
        district = COALESCE(NULLIF(trim(COALESCE(p_district, '')), ''), district),
        known_languages = COALESCE(p_known_languages, known_languages),
        employment_status = COALESCE(p_employment_status, employment_status),
        updated_at = NOW()
      WHERE user_id = p_user_id;

      -- Update ledger name if full_name changed
      IF p_full_name IS NOT NULL AND trim(p_full_name) != '' AND trim(p_full_name) != v_old_name THEN
        UPDATE ledgers SET
          ledger_name = trim(p_full_name),
          updated_at = NOW()
        WHERE reference_type = 'employee' AND reference_id = v_employee_id AND is_system_generated = TRUE;
      END IF;

      RETURN json_build_object('success', true, 'message', 'Employee user updated successfully');

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_update_employee_user created.');

  // --- rpc_get_employee_user ---
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
        'monthly_salary', e.monthly_salary,
        'whatsapp_number', e.whatsapp_number,
        'email', e.email,
        'joining_date', e.joining_date,
        'id_type', e.id_type,
        'state', e.state,
        'district', e.district,
        'known_languages', e.known_languages,
        'employment_status', e.employment_status,
        'ledger_id', l.id,
        'ledger_code', l.ledger_code,
        'created_at', u.created_at
      ) INTO v_result
      FROM users u
      JOIN employee_master e ON e.user_id = u.id
      JOIN job_titles jt ON jt.id = e.job_title_id
      LEFT JOIN ledgers l ON l.reference_type = 'employee' AND l.reference_id = e.id
      WHERE u.id = p_user_id;

      IF v_result IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User not found');
      END IF;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_employee_user created.');

  // --- rpc_list_employee_users ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_employee_users(
      p_search TEXT DEFAULT '',
      p_status_filter TEXT DEFAULT NULL,
      p_job_title_filter UUID DEFAULT NULL,
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
      v_order TEXT;
    BEGIN
      v_search := '%' || lower(trim(COALESCE(p_search, ''))) || '%';

      -- Validate sort column
      IF p_sort_by NOT IN ('full_name','username','employee_code','created_at','monthly_salary','joining_date') THEN
        p_sort_by := 'created_at';
      END IF;
      IF p_sort_dir NOT IN ('asc','desc') THEN
        p_sort_dir := 'desc';
      END IF;

      -- Count total
      SELECT COUNT(*) INTO v_total
      FROM users u
      JOIN employee_master e ON e.user_id = u.id
      JOIN job_titles jt ON jt.id = e.job_title_id
      WHERE (v_search = '%%' OR
             lower(u.full_name) LIKE v_search OR
             lower(u.username) LIKE v_search OR
             lower(e.employee_code) LIKE v_search OR
             lower(e.whatsapp_number) LIKE v_search OR
             lower(COALESCE(e.email, '')) LIKE v_search)
        AND (p_status_filter IS NULL OR e.employment_status = p_status_filter)
        AND (p_job_title_filter IS NULL OR e.job_title_id = p_job_title_filter);

      -- Fetch rows
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
          e.monthly_salary,
          e.joining_date,
          e.employment_status,
          u.is_active,
          u.created_at
        FROM users u
        JOIN employee_master e ON e.user_id = u.id
        JOIN job_titles jt ON jt.id = e.job_title_id
        WHERE (v_search = '%%' OR
               lower(u.full_name) LIKE v_search OR
               lower(u.username) LIKE v_search OR
               lower(e.employee_code) LIKE v_search OR
               lower(e.whatsapp_number) LIKE v_search OR
               lower(COALESCE(e.email, '')) LIKE v_search)
          AND (p_status_filter IS NULL OR e.employment_status = p_status_filter)
          AND (p_job_title_filter IS NULL OR e.job_title_id = p_job_title_filter)
        ORDER BY
          CASE WHEN p_sort_by = 'full_name' AND p_sort_dir = 'asc' THEN u.full_name END ASC,
          CASE WHEN p_sort_by = 'full_name' AND p_sort_dir = 'desc' THEN u.full_name END DESC,
          CASE WHEN p_sort_by = 'username' AND p_sort_dir = 'asc' THEN u.username END ASC,
          CASE WHEN p_sort_by = 'username' AND p_sort_dir = 'desc' THEN u.username END DESC,
          CASE WHEN p_sort_by = 'employee_code' AND p_sort_dir = 'asc' THEN e.employee_code END ASC,
          CASE WHEN p_sort_by = 'employee_code' AND p_sort_dir = 'desc' THEN e.employee_code END DESC,
          CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN u.created_at END ASC,
          CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN u.created_at END DESC,
          CASE WHEN p_sort_by = 'monthly_salary' AND p_sort_dir = 'asc' THEN e.monthly_salary END ASC,
          CASE WHEN p_sort_by = 'monthly_salary' AND p_sort_dir = 'desc' THEN e.monthly_salary END DESC,
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
  console.log('rpc_list_employee_users created.');

  // --- rpc_get_account_groups ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_account_groups()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT json_agg(row_to_json(t))
        FROM (
          SELECT id, group_code, group_name, parent_group_id, account_category, normal_balance, is_system
          FROM account_groups
          WHERE is_active = TRUE
          ORDER BY group_name
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_get_account_groups created.');

  // --- rpc_get_employee_ledger ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_employee_ledger(p_employee_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
    BEGIN
      SELECT json_build_object(
        'ledger_id', l.id,
        'ledger_code', l.ledger_code,
        'ledger_name', l.ledger_name,
        'account_group', ag.group_name,
        'opening_balance', l.opening_balance,
        'opening_balance_side', l.opening_balance_side,
        'currency_code', l.currency_code,
        'is_active', l.is_active
      ) INTO v_result
      FROM ledgers l
      JOIN account_groups ag ON ag.id = l.account_group_id
      WHERE l.reference_type = 'employee' AND l.reference_id = p_employee_id;

      IF v_result IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee ledger not found');
      END IF;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_employee_ledger created.');

  // --- rpc_get_ledger_statement ---
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_ledger_statement(
      p_ledger_id UUID,
      p_from_date DATE DEFAULT NULL,
      p_to_date DATE DEFAULT NULL,
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
    BEGIN
      SELECT COUNT(*) INTO v_total
      FROM accounting_entries ae
      JOIN accounting_transactions at2 ON at2.id = ae.transaction_id
      WHERE ae.ledger_id = p_ledger_id
        AND (p_from_date IS NULL OR at2.transaction_date >= p_from_date)
        AND (p_to_date IS NULL OR at2.transaction_date <= p_to_date);

      SELECT json_agg(row_to_json(t)) INTO v_rows
      FROM (
        SELECT
          at2.voucher_number,
          at2.voucher_type,
          at2.transaction_date,
          at2.description AS txn_description,
          ae.debit_amount,
          ae.credit_amount,
          ae.description AS entry_description
        FROM accounting_entries ae
        JOIN accounting_transactions at2 ON at2.id = ae.transaction_id
        WHERE ae.ledger_id = p_ledger_id
          AND (p_from_date IS NULL OR at2.transaction_date >= p_from_date)
          AND (p_to_date IS NULL OR at2.transaction_date <= p_to_date)
        ORDER BY at2.transaction_date DESC, at2.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t;

      RETURN json_build_object(
        'success', true,
        'data', COALESCE(v_rows, '[]'::JSON),
        'total', v_total
      );
    END;
    $$
  `);
  console.log('rpc_get_ledger_statement created.');

  // ============================================================
  // 15. GRANT EXECUTE TO ANON
  // ============================================================
  const rpcs = [
    'rpc_get_active_job_titles()',
    'rpc_check_username_availability(TEXT)',
    'rpc_generate_quick_access_code()',
    'rpc_create_employee_user(TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,UUID,NUMERIC,DATE,TEXT,TEXT,TEXT,TEXT,TEXT[])',
    'rpc_update_employee_user(UUID,TEXT,TEXT,BOOLEAN,TEXT,TEXT,UUID,NUMERIC,DATE,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT,TEXT,TEXT)',
    'rpc_get_employee_user(UUID)',
    'rpc_list_employee_users(TEXT,TEXT,UUID,TEXT,TEXT,INTEGER,INTEGER)',
    'rpc_get_account_groups()',
    'rpc_get_employee_ledger(UUID)',
    'rpc_get_ledger_statement(UUID,DATE,DATE,INTEGER,INTEGER)',
  ];
  for (const rpc of rpcs) {
    await client.query(`GRANT EXECUTE ON FUNCTION ${rpc} TO anon`);
  }
  console.log('Granted EXECUTE on all RPCs to anon.');

  await client.end();
  console.log('\n✅ Migration complete!');
}

run().catch(async (e) => {
  console.error('Migration failed:', e.message);
  console.error(e.stack);
  await client.end();
  process.exit(1);
});
