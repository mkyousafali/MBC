require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. Attendance Log table
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS attendance_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      branch_id       UUID NOT NULL REFERENCES branches(id),
      action_type     TEXT NOT NULL CHECK (action_type IN ('clock_in', 'clock_out')),
      recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('attendance_log table created.');

  await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_log(user_id, recorded_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_branch ON attendance_log(branch_id, recorded_at DESC)`);
  console.log('Indexes created.');

  // ============================================================
  // 2. RPC: Clock attendance (verify + record in one call)
  // ============================================================
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
      -- Validate action type
      IF p_action_type NOT IN ('clock_in', 'clock_out') THEN
        RETURN json_build_object('success', false, 'message', 'Invalid action type.');
      END IF;

      -- Get branch secret
      SELECT qr_secret INTO v_secret
      FROM branches WHERE id = p_branch_id AND is_active = TRUE;

      IF v_secret IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Branch not found.');
      END IF;

      -- Current 5-second window (based on server time)
      v_current_window := floor(extract(epoch from now()) / 5)::BIGINT;

      -- Generate expected codes for current and previous window (±1 tolerance)
      v_expected_code := upper(left(encode(digest(v_secret::TEXT || v_current_window::TEXT, 'sha256'), 'hex'), 8));
      v_prev_code := upper(left(encode(digest(v_secret::TEXT || (v_current_window - 1)::TEXT, 'sha256'), 'hex'), 8));

      -- Compare (case-insensitive)
      IF upper(p_code) != v_expected_code AND upper(p_code) != v_prev_code THEN
        RETURN json_build_object('success', false, 'message', 'Code expired or invalid. Please scan again.');
      END IF;

      -- Record attendance
      INSERT INTO attendance_log (user_id, branch_id, action_type)
      VALUES (p_user_id, p_branch_id, p_action_type)
      RETURNING id INTO v_new_id;

      RETURN json_build_object('success', true, 'id', v_new_id, 'action', p_action_type);
    END;
    $$
  `);
  console.log('rpc_clock_attendance created.');

  // ============================================================
  // 3. RPC: Get last clock action for user today
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_last_clock_action(p_user_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
    BEGIN
      SELECT json_build_object(
        'action_type', al.action_type,
        'recorded_at', al.recorded_at
      ) INTO v_result
      FROM attendance_log al
      WHERE al.user_id = p_user_id
        AND al.recorded_at::DATE = CURRENT_DATE
      ORDER BY al.recorded_at DESC
      LIMIT 1;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_last_clock_action created.');

  // ============================================================
  // 4. Fix verify RPC to be case-insensitive
  // ============================================================
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

      v_expected_code := upper(left(encode(digest(v_secret::TEXT || v_current_window::TEXT, 'sha256'), 'hex'), 8));
      v_prev_code := upper(left(encode(digest(v_secret::TEXT || (v_current_window - 1)::TEXT, 'sha256'), 'hex'), 8));

      IF upper(p_code) = v_expected_code OR upper(p_code) = v_prev_code THEN
        RETURN json_build_object('success', true, 'valid', true);
      ELSE
        RETURN json_build_object('success', true, 'valid', false, 'message', 'Code expired or invalid.');
      END IF;
    END;
    $$
  `);
  console.log('rpc_verify_attendance_code updated (case-insensitive).');

  // ============================================================
  // 5. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_clock_attendance(UUID, UUID, TEXT, BIGINT, TEXT) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_last_clock_action(UUID) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_verify_attendance_code(UUID, TEXT, BIGINT) TO anon, authenticated`);
  console.log('Permissions granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
