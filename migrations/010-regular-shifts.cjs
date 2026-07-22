require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. REGULAR_SHIFTS table
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS regular_shifts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_time      TIME NOT NULL,
      end_time        TIME NOT NULL,
      is_next_day     BOOLEAN NOT NULL DEFAULT FALSE,
      start_buffer_hours NUMERIC(4,2) NOT NULL DEFAULT 3,
      end_buffer_hours   NUMERIC(4,2) NOT NULL DEFAULT 3,
      total_hours     NUMERIC(5,2) NOT NULL DEFAULT 0,
      shift_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      shift_end_date   DATE NULL,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('regular_shifts table created.');

  await client.query(`CREATE INDEX IF NOT EXISTS idx_regular_shifts_user_id ON regular_shifts(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_regular_shifts_active ON regular_shifts(user_id, is_active)`);
  console.log('Indexes created.');

  // ============================================================
  // 2. RPC: Get current active shift for a user
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_active_shift(p_user_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
    BEGIN
      SELECT json_build_object(
        'id', rs.id,
        'user_id', rs.user_id,
        'start_time', to_char(rs.start_time, 'HH12:MI AM'),
        'end_time', to_char(rs.end_time, 'HH12:MI AM'),
        'is_next_day', rs.is_next_day,
        'start_buffer_hours', rs.start_buffer_hours,
        'end_buffer_hours', rs.end_buffer_hours,
        'total_hours', rs.total_hours,
        'shift_start_date', rs.shift_start_date,
        'shift_end_date', rs.shift_end_date,
        'created_at', rs.created_at
      ) INTO v_result
      FROM regular_shifts rs
      WHERE rs.user_id = p_user_id AND rs.is_active = TRUE
      ORDER BY rs.shift_start_date DESC
      LIMIT 1;

      RETURN json_build_object('success', true, 'data', v_result);
    END;
    $$
  `);
  console.log('rpc_get_active_shift created.');

  // ============================================================
  // 3. RPC: Add a new regular shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_regular_shift(
      p_user_id UUID,
      p_start_time TEXT,
      p_end_time TEXT,
      p_is_next_day BOOLEAN DEFAULT FALSE,
      p_start_buffer_hours NUMERIC DEFAULT 3,
      p_end_buffer_hours NUMERIC DEFAULT 3,
      p_total_hours NUMERIC DEFAULT 0,
      p_shift_start_date DATE DEFAULT CURRENT_DATE
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_existing UUID;
      v_new_id UUID;
    BEGIN
      -- Check if user already has an active shift
      SELECT id INTO v_existing
      FROM regular_shifts
      WHERE user_id = p_user_id AND is_active = TRUE;

      IF v_existing IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee already has an active shift. Use Change Shift instead.');
      END IF;

      INSERT INTO regular_shifts (user_id, start_time, end_time, is_next_day, start_buffer_hours, end_buffer_hours, total_hours, shift_start_date, shift_end_date, is_active)
      VALUES (
        p_user_id,
        p_start_time::TIME,
        p_end_time::TIME,
        p_is_next_day,
        p_start_buffer_hours,
        p_end_buffer_hours,
        p_total_hours,
        p_shift_start_date,
        NULL,
        TRUE
      )
      RETURNING id INTO v_new_id;

      RETURN json_build_object('success', true, 'shift_id', v_new_id);
    END;
    $$
  `);
  console.log('rpc_add_regular_shift created.');

  // ============================================================
  // 4. RPC: Change (rotate) a regular shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_change_regular_shift(
      p_user_id UUID,
      p_new_start_date DATE,
      p_start_time TEXT,
      p_end_time TEXT,
      p_is_next_day BOOLEAN DEFAULT FALSE,
      p_start_buffer_hours NUMERIC DEFAULT 3,
      p_end_buffer_hours NUMERIC DEFAULT 3,
      p_total_hours NUMERIC DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_old_id UUID;
      v_new_id UUID;
    BEGIN
      IF p_new_start_date IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Start date is required for shift change.');
      END IF;

      -- Find current active shift
      SELECT id INTO v_old_id
      FROM regular_shifts
      WHERE user_id = p_user_id AND is_active = TRUE
      ORDER BY shift_start_date DESC
      LIMIT 1;

      IF v_old_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No active shift found to change.');
      END IF;

      -- Close the old shift: set end_date to day before new start, mark inactive
      UPDATE regular_shifts
      SET shift_end_date = p_new_start_date - INTERVAL '1 day',
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = v_old_id;

      -- Create new shift
      INSERT INTO regular_shifts (user_id, start_time, end_time, is_next_day, start_buffer_hours, end_buffer_hours, total_hours, shift_start_date, shift_end_date, is_active)
      VALUES (
        p_user_id,
        p_start_time::TIME,
        p_end_time::TIME,
        p_is_next_day,
        p_start_buffer_hours,
        p_end_buffer_hours,
        p_total_hours,
        p_new_start_date,
        NULL,
        TRUE
      )
      RETURNING id INTO v_new_id;

      RETURN json_build_object('success', true, 'old_shift_id', v_old_id, 'new_shift_id', v_new_id);
    END;
    $$
  `);
  console.log('rpc_change_regular_shift created.');

  // ============================================================
  // 5. RPC: List all employees with their active shift info
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_employee_shifts()
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_result JSON;
    BEGIN
      SELECT json_agg(row_to_json(t)) INTO v_result
      FROM (
        SELECT
          u.id AS user_id,
          e.employee_code,
          u.full_name,
          e.whatsapp_number,
          rs.id AS shift_id,
          CASE WHEN rs.id IS NOT NULL THEN to_char(rs.start_time, 'HH12:MI AM') ELSE NULL END AS start_time,
          CASE WHEN rs.id IS NOT NULL THEN to_char(rs.end_time, 'HH12:MI AM') ELSE NULL END AS end_time,
          rs.is_next_day,
          rs.start_buffer_hours,
          rs.end_buffer_hours,
          rs.total_hours,
          rs.shift_start_date,
          rs.shift_end_date,
          rs.created_at AS shift_created_at
        FROM users u
        JOIN employee_master e ON e.user_id = u.id
        LEFT JOIN regular_shifts rs ON rs.user_id = u.id AND rs.is_active = TRUE
        WHERE e.employment_status = 'active'
        ORDER BY u.full_name ASC
      ) t;

      RETURN json_build_object('success', true, 'data', COALESCE(v_result, '[]'::JSON));
    END;
    $$
  `);
  console.log('rpc_list_employee_shifts created.');

  // ============================================================
  // 6. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_active_shift(UUID) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_add_regular_shift(UUID, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, DATE) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_change_regular_shift(UUID, DATE, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_employee_shifts() TO anon, authenticated`);
  console.log('Permissions granted.');

  // Reload PostgREST schema cache
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
