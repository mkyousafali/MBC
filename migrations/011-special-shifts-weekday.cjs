require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. SPECIAL_SHIFTS_WEEKDAY table
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS special_shifts_weekday (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weekday         TEXT NOT NULL CHECK (weekday IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
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
  console.log('special_shifts_weekday table created.');

  await client.query(`CREATE INDEX IF NOT EXISTS idx_special_shifts_weekday_user ON special_shifts_weekday(user_id, is_active)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_special_shifts_weekday_day ON special_shifts_weekday(user_id, weekday, is_active)`);
  console.log('Indexes created.');

  // ============================================================
  // 2. RPC: Add special weekday shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_special_shift_weekday(
      p_user_id UUID,
      p_weekday TEXT,
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
      -- Check if user already has an active shift for this weekday
      SELECT id INTO v_existing
      FROM special_shifts_weekday
      WHERE user_id = p_user_id AND weekday = p_weekday AND is_active = TRUE;

      IF v_existing IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee already has an active special shift for ' || p_weekday || '. Use Change instead.');
      END IF;

      INSERT INTO special_shifts_weekday (user_id, weekday, start_time, end_time, is_next_day, start_buffer_hours, end_buffer_hours, total_hours, shift_start_date, shift_end_date, is_active)
      VALUES (
        p_user_id,
        p_weekday,
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
  console.log('rpc_add_special_shift_weekday created.');

  // ============================================================
  // 3. RPC: Change special weekday shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_change_special_shift_weekday(
      p_user_id UUID,
      p_weekday TEXT,
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

      -- Find current active shift for this weekday
      SELECT id INTO v_old_id
      FROM special_shifts_weekday
      WHERE user_id = p_user_id AND weekday = p_weekday AND is_active = TRUE
      ORDER BY shift_start_date DESC
      LIMIT 1;

      IF v_old_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No active special shift found for ' || p_weekday || '.');
      END IF;

      -- Close old shift
      UPDATE special_shifts_weekday
      SET shift_end_date = p_new_start_date - INTERVAL '1 day',
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = v_old_id;

      -- Create new shift
      INSERT INTO special_shifts_weekday (user_id, weekday, start_time, end_time, is_next_day, start_buffer_hours, end_buffer_hours, total_hours, shift_start_date, shift_end_date, is_active)
      VALUES (
        p_user_id,
        p_weekday,
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
  console.log('rpc_change_special_shift_weekday created.');

  // ============================================================
  // 4. RPC: List employees with their active weekday shifts
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_employee_weekday_shifts()
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
          (
            SELECT json_agg(json_build_object(
              'id', sw.id,
              'weekday', sw.weekday,
              'start_time', to_char(sw.start_time, 'HH12:MI AM'),
              'end_time', to_char(sw.end_time, 'HH12:MI AM'),
              'is_next_day', sw.is_next_day,
              'start_buffer_hours', sw.start_buffer_hours,
              'end_buffer_hours', sw.end_buffer_hours,
              'total_hours', sw.total_hours,
              'shift_start_date', sw.shift_start_date,
              'created_at', sw.created_at
            ) ORDER BY CASE sw.weekday
              WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
              WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
              WHEN 'sunday' THEN 7 END)
            FROM special_shifts_weekday sw
            WHERE sw.user_id = u.id AND sw.is_active = TRUE
          ) AS weekday_shifts
        FROM users u
        JOIN employee_master e ON e.user_id = u.id
        WHERE e.employment_status = 'active'
        ORDER BY u.full_name ASC
      ) t;

      RETURN json_build_object('success', true, 'data', COALESCE(v_result, '[]'::JSON));
    END;
    $$
  `);
  console.log('rpc_list_employee_weekday_shifts created.');

  // ============================================================
  // 5. RPC: Delete (deactivate) a weekday shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_special_shift_weekday(
      p_shift_id UUID
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      UPDATE special_shifts_weekday
      SET is_active = FALSE, shift_end_date = CURRENT_DATE, updated_at = NOW()
      WHERE id = p_shift_id AND is_active = TRUE;

      IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Shift not found or already inactive.');
      END IF;

      RETURN json_build_object('success', true);
    END;
    $$
  `);
  console.log('rpc_delete_special_shift_weekday created.');

  // ============================================================
  // 6. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_add_special_shift_weekday(UUID, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, DATE) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_change_special_shift_weekday(UUID, TEXT, DATE, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_employee_weekday_shifts() TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_delete_special_shift_weekday(UUID) TO anon, authenticated`);
  console.log('Permissions granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
