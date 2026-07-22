require('dotenv/config');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. RPC: Team login via username + password
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_team_login_username(
      p_username TEXT,
      p_password_hash TEXT
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_user RECORD;
      v_emp  RECORD;
    BEGIN
      -- Find active user by username
      SELECT id, full_name, username, is_active
      INTO v_user
      FROM users
      WHERE lower(trim(username)) = lower(trim(p_username))
        AND password_hash = p_password_hash
      LIMIT 1;

      IF v_user.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid username or password');
      END IF;

      IF NOT v_user.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Account is inactive. Contact admin.');
      END IF;

      -- Get employee details
      SELECT em.id as emp_id, em.employee_code, jt.title_name as job_title, jt.department_name,
             b.branch_name
      INTO v_emp
      FROM employee_master em
      LEFT JOIN job_titles jt ON jt.id = em.job_title_id
      LEFT JOIN branches b ON b.id = em.branch_id
      WHERE em.user_id = v_user.id
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user.id,
        'full_name', v_user.full_name,
        'username', v_user.username,
        'employee_code', COALESCE(v_emp.employee_code, ''),
        'job_title', COALESCE(v_emp.job_title, ''),
        'department', COALESCE(v_emp.department_name, ''),
        'branch_name', COALESCE(v_emp.branch_name, '')
      );
    END;
    $$
  `);
  console.log('rpc_team_login_username created.');

  // ============================================================
  // 2. RPC: Team login via quick access code
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_team_login_qac(
      p_qac_hash TEXT
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_user RECORD;
      v_emp  RECORD;
    BEGIN
      -- Find active user by quick access code hash
      SELECT id, full_name, username, is_active
      INTO v_user
      FROM users
      WHERE quick_access_code_hash = p_qac_hash
      LIMIT 1;

      IF v_user.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid access code');
      END IF;

      IF NOT v_user.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Account is inactive. Contact admin.');
      END IF;

      -- Get employee details
      SELECT em.id as emp_id, em.employee_code, jt.title_name as job_title, jt.department_name,
             b.branch_name
      INTO v_emp
      FROM employee_master em
      LEFT JOIN job_titles jt ON jt.id = em.job_title_id
      LEFT JOIN branches b ON b.id = em.branch_id
      WHERE em.user_id = v_user.id
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user.id,
        'full_name', v_user.full_name,
        'username', v_user.username,
        'employee_code', COALESCE(v_emp.employee_code, ''),
        'job_title', COALESCE(v_emp.job_title, ''),
        'department', COALESCE(v_emp.department_name, ''),
        'branch_name', COALESCE(v_emp.branch_name, '')
      );
    END;
    $$
  `);
  console.log('rpc_team_login_qac created.');

  // ============================================================
  // 3. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_team_login_username(text, text) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_team_login_qac(text) TO anon, authenticated`);
  console.log('Permissions granted.');

  // ============================================================
  // 4. Reload PostgREST schema cache
  // ============================================================
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log('PostgREST schema reload notified.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
