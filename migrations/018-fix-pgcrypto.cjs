require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // Enable pgcrypto extension
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  console.log('pgcrypto extension enabled.');

  // Recreate rpc_clock_attendance with pgcrypto available
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_clock_attendance(
      p_user_id UUID,
      p_branch_id UUID,
      p_code TEXT,
      p_window_num BIGINT,
      p_action_type TEXT
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_secret UUID;
      v_current_window BIGINT;
      v_expected_code TEXT;
      v_prev_code TEXT;
      v_new_id UUID;
    BEGIN
      IF p_action_type NOT IN ('clock_in', 'clock_out') THEN
        RETURN json_build_object('success', false, 'message', 'Invalid action type.');
      END IF;

      SELECT qr_secret INTO v_secret
      FROM branches WHERE id = p_branch_id AND is_active = TRUE;

      IF v_secret IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Branch not found.');
      END IF;

      v_current_window := floor(extract(epoch from now()) / 5)::BIGINT;

      v_expected_code := upper(left(encode(digest((v_secret::TEXT || v_current_window::TEXT)::bytea, 'sha256'), 'hex'), 8));
      v_prev_code := upper(left(encode(digest((v_secret::TEXT || (v_current_window - 1)::TEXT)::bytea, 'sha256'), 'hex'), 8));

      IF upper(p_code) != v_expected_code AND upper(p_code) != v_prev_code THEN
        RETURN json_build_object('success', false, 'message', 'Code expired or invalid. Please scan again.');
      END IF;

      INSERT INTO attendance_log (user_id, branch_id, action_type)
      VALUES (p_user_id, p_branch_id, p_action_type)
      RETURNING id INTO v_new_id;

      RETURN json_build_object('success', true, 'id', v_new_id, 'action', p_action_type);
    END;
    $$
  `);
  console.log('rpc_clock_attendance fixed.');

  // Recreate rpc_verify_attendance_code
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_verify_attendance_code(
      p_branch_id UUID,
      p_code TEXT,
      p_window_num BIGINT
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_secret UUID;
      v_current_window BIGINT;
      v_expected_code TEXT;
      v_prev_code TEXT;
    BEGIN
      SELECT qr_secret INTO v_secret
      FROM branches WHERE id = p_branch_id AND is_active = TRUE;

      IF v_secret IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Branch not found.');
      END IF;

      v_current_window := floor(extract(epoch from now()) / 5)::BIGINT;

      v_expected_code := upper(left(encode(digest((v_secret::TEXT || v_current_window::TEXT)::bytea, 'sha256'), 'hex'), 8));
      v_prev_code := upper(left(encode(digest((v_secret::TEXT || (v_current_window - 1)::TEXT)::bytea, 'sha256'), 'hex'), 8));

      IF upper(p_code) = v_expected_code OR upper(p_code) = v_prev_code THEN
        RETURN json_build_object('success', true, 'valid', true);
      ELSE
        RETURN json_build_object('success', true, 'valid', false, 'message', 'Code expired or invalid.');
      END IF;
    END;
    $$
  `);
  console.log('rpc_verify_attendance_code fixed.');

  await client.query(`GRANT EXECUTE ON FUNCTION rpc_clock_attendance(UUID, UUID, TEXT, BIGINT, TEXT) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_verify_attendance_code(UUID, TEXT, BIGINT) TO anon, authenticated`);
  console.log('Permissions granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
