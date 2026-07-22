require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. Add shift_group_id to all three shift tables
  // ============================================================
  await client.query(`
    ALTER TABLE regular_shifts ADD COLUMN IF NOT EXISTS shift_group_id UUID NOT NULL DEFAULT gen_random_uuid()
  `);
  await client.query(`
    ALTER TABLE special_shifts_weekday ADD COLUMN IF NOT EXISTS shift_group_id UUID NOT NULL DEFAULT gen_random_uuid()
  `);
  await client.query(`
    ALTER TABLE special_shifts_date ADD COLUMN IF NOT EXISTS shift_group_id UUID NOT NULL DEFAULT gen_random_uuid()
  `);
  console.log('shift_group_id columns added.');

  // Create indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_regular_shifts_group ON regular_shifts(shift_group_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_special_weekday_group ON special_shifts_weekday(shift_group_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_special_date_group ON special_shifts_date(shift_group_id)`);
  console.log('Group indexes created.');

  // ============================================================
  // 2. RPC: Add regular shift (supports multi-shift)
  //    Accepts JSON array of time slots
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_regular_shift_multi(
      p_user_id UUID,
      p_shifts JSONB,
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
      v_group_id UUID;
      v_shift JSONB;
      v_count INTEGER := 0;
    BEGIN
      -- Check if user already has active shifts
      SELECT id INTO v_existing
      FROM regular_shifts
      WHERE user_id = p_user_id AND is_active = TRUE
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee already has an active shift. Use Change Shift instead.');
      END IF;

      -- Generate one group_id for all shifts in this assignment
      v_group_id := gen_random_uuid();

      -- Insert each shift in the array
      FOR v_shift IN SELECT * FROM jsonb_array_elements(p_shifts)
      LOOP
        INSERT INTO regular_shifts (
          user_id, shift_group_id, start_time, end_time, is_next_day,
          start_buffer_hours, end_buffer_hours, total_hours,
          shift_start_date, shift_end_date, is_active
        ) VALUES (
          p_user_id,
          v_group_id,
          (v_shift->>'start_time')::TIME,
          (v_shift->>'end_time')::TIME,
          COALESCE((v_shift->>'is_next_day')::BOOLEAN, FALSE),
          p_start_buffer_hours,
          p_end_buffer_hours,
          COALESCE((v_shift->>'total_hours')::NUMERIC, 0),
          p_shift_start_date,
          NULL,
          TRUE
        );
        v_count := v_count + 1;
      END LOOP;

      RETURN json_build_object('success', true, 'shift_group_id', v_group_id, 'shifts_added', v_count, 'total_hours', p_total_hours);
    END;
    $$
  `);
  console.log('rpc_add_regular_shift_multi created.');

  // ============================================================
  // 3. RPC: Change regular shift (supports multi-shift)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_change_regular_shift_multi(
      p_user_id UUID,
      p_new_start_date DATE,
      p_shifts JSONB,
      p_start_buffer_hours NUMERIC DEFAULT 3,
      p_end_buffer_hours NUMERIC DEFAULT 3,
      p_total_hours NUMERIC DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_group_id UUID;
      v_shift JSONB;
      v_count INTEGER := 0;
    BEGIN
      IF p_new_start_date IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Start date is required for shift change.');
      END IF;

      -- Close ALL current active shifts for this user
      UPDATE regular_shifts
      SET shift_end_date = p_new_start_date - INTERVAL '1 day',
          is_active = FALSE,
          updated_at = NOW()
      WHERE user_id = p_user_id AND is_active = TRUE;

      -- Generate new group_id
      v_group_id := gen_random_uuid();

      -- Insert new shifts
      FOR v_shift IN SELECT * FROM jsonb_array_elements(p_shifts)
      LOOP
        INSERT INTO regular_shifts (
          user_id, shift_group_id, start_time, end_time, is_next_day,
          start_buffer_hours, end_buffer_hours, total_hours,
          shift_start_date, shift_end_date, is_active
        ) VALUES (
          p_user_id,
          v_group_id,
          (v_shift->>'start_time')::TIME,
          (v_shift->>'end_time')::TIME,
          COALESCE((v_shift->>'is_next_day')::BOOLEAN, FALSE),
          p_start_buffer_hours,
          p_end_buffer_hours,
          COALESCE((v_shift->>'total_hours')::NUMERIC, 0),
          p_new_start_date,
          NULL,
          TRUE
        );
        v_count := v_count + 1;
      END LOOP;

      RETURN json_build_object('success', true, 'shift_group_id', v_group_id, 'shifts_added', v_count, 'total_hours', p_total_hours);
    END;
    $$
  `);
  console.log('rpc_change_regular_shift_multi created.');

  // ============================================================
  // 4. RPC: List employees with grouped shifts
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
          (
            SELECT json_agg(json_build_object(
              'id', rs.id,
              'start_time', to_char(rs.start_time, 'HH12:MI AM'),
              'end_time', to_char(rs.end_time, 'HH12:MI AM'),
              'is_next_day', rs.is_next_day,
              'total_hours', rs.total_hours
            ) ORDER BY rs.start_time)
            FROM regular_shifts rs
            WHERE rs.user_id = u.id AND rs.is_active = TRUE
          ) AS shifts,
          (
            SELECT rs2.shift_group_id
            FROM regular_shifts rs2
            WHERE rs2.user_id = u.id AND rs2.is_active = TRUE
            LIMIT 1
          ) AS shift_group_id,
          (
            SELECT rs3.start_buffer_hours
            FROM regular_shifts rs3
            WHERE rs3.user_id = u.id AND rs3.is_active = TRUE
            LIMIT 1
          ) AS start_buffer_hours,
          (
            SELECT rs4.end_buffer_hours
            FROM regular_shifts rs4
            WHERE rs4.user_id = u.id AND rs4.is_active = TRUE
            LIMIT 1
          ) AS end_buffer_hours,
          (
            SELECT SUM(rs5.total_hours)
            FROM regular_shifts rs5
            WHERE rs5.user_id = u.id AND rs5.is_active = TRUE
          ) AS total_hours,
          (
            SELECT rs6.shift_start_date
            FROM regular_shifts rs6
            WHERE rs6.user_id = u.id AND rs6.is_active = TRUE
            ORDER BY rs6.shift_start_date DESC LIMIT 1
          ) AS shift_start_date
        FROM users u
        JOIN employee_master e ON e.user_id = u.id
        WHERE e.employment_status = 'active'
        ORDER BY u.full_name ASC
      ) t;

      RETURN json_build_object('success', true, 'data', COALESCE(v_result, '[]'::JSON));
    END;
    $$
  `);
  console.log('rpc_list_employee_shifts updated (grouped).');

  // ============================================================
  // 5. RPC: Add weekday shift multi
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_weekday_shift_multi(
      p_user_id UUID,
      p_weekday TEXT,
      p_shifts JSONB,
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
      v_group_id UUID;
      v_shift JSONB;
      v_count INTEGER := 0;
    BEGIN
      -- Check if user already has active shift for this weekday
      SELECT id INTO v_existing
      FROM special_shifts_weekday
      WHERE user_id = p_user_id AND weekday = p_weekday AND is_active = TRUE
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Employee already has an active special shift for ' || p_weekday || '. Use Change instead.');
      END IF;

      v_group_id := gen_random_uuid();

      FOR v_shift IN SELECT * FROM jsonb_array_elements(p_shifts)
      LOOP
        INSERT INTO special_shifts_weekday (
          user_id, shift_group_id, weekday, start_time, end_time, is_next_day,
          start_buffer_hours, end_buffer_hours, total_hours,
          shift_start_date, shift_end_date, is_active
        ) VALUES (
          p_user_id,
          v_group_id,
          p_weekday,
          (v_shift->>'start_time')::TIME,
          (v_shift->>'end_time')::TIME,
          COALESCE((v_shift->>'is_next_day')::BOOLEAN, FALSE),
          p_start_buffer_hours,
          p_end_buffer_hours,
          COALESCE((v_shift->>'total_hours')::NUMERIC, 0),
          p_shift_start_date,
          NULL,
          TRUE
        );
        v_count := v_count + 1;
      END LOOP;

      RETURN json_build_object('success', true, 'shift_group_id', v_group_id, 'shifts_added', v_count);
    END;
    $$
  `);
  console.log('rpc_add_weekday_shift_multi created.');

  // ============================================================
  // 6. RPC: Change weekday shift multi
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_change_weekday_shift_multi(
      p_user_id UUID,
      p_weekday TEXT,
      p_new_start_date DATE,
      p_shifts JSONB,
      p_start_buffer_hours NUMERIC DEFAULT 3,
      p_end_buffer_hours NUMERIC DEFAULT 3,
      p_total_hours NUMERIC DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_group_id UUID;
      v_shift JSONB;
      v_count INTEGER := 0;
    BEGIN
      IF p_new_start_date IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Start date is required.');
      END IF;

      -- Close all active shifts for this user+weekday
      UPDATE special_shifts_weekday
      SET shift_end_date = p_new_start_date - INTERVAL '1 day',
          is_active = FALSE,
          updated_at = NOW()
      WHERE user_id = p_user_id AND weekday = p_weekday AND is_active = TRUE;

      v_group_id := gen_random_uuid();

      FOR v_shift IN SELECT * FROM jsonb_array_elements(p_shifts)
      LOOP
        INSERT INTO special_shifts_weekday (
          user_id, shift_group_id, weekday, start_time, end_time, is_next_day,
          start_buffer_hours, end_buffer_hours, total_hours,
          shift_start_date, shift_end_date, is_active
        ) VALUES (
          p_user_id,
          v_group_id,
          p_weekday,
          (v_shift->>'start_time')::TIME,
          (v_shift->>'end_time')::TIME,
          COALESCE((v_shift->>'is_next_day')::BOOLEAN, FALSE),
          p_start_buffer_hours,
          p_end_buffer_hours,
          COALESCE((v_shift->>'total_hours')::NUMERIC, 0),
          p_new_start_date,
          NULL,
          TRUE
        );
        v_count := v_count + 1;
      END LOOP;

      RETURN json_build_object('success', true, 'shift_group_id', v_group_id, 'shifts_added', v_count);
    END;
    $$
  `);
  console.log('rpc_change_weekday_shift_multi created.');

  // ============================================================
  // 7. RPC: List weekday shifts (updated with sub-shift arrays)
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
              'weekday', sub.weekday,
              'shift_group_id', sub.shift_group_id,
              'shifts', sub.shifts,
              'total_hours', sub.total_hours,
              'shift_start_date', sub.shift_start_date
            ))
            FROM (
              SELECT
                sw.weekday,
                sw.shift_group_id,
                sw.shift_start_date,
                SUM(sw.total_hours) AS total_hours,
                json_agg(json_build_object(
                  'id', sw.id,
                  'start_time', to_char(sw.start_time, 'HH12:MI AM'),
                  'end_time', to_char(sw.end_time, 'HH12:MI AM'),
                  'is_next_day', sw.is_next_day,
                  'total_hours', sw.total_hours,
                  'start_buffer_hours', sw.start_buffer_hours,
                  'end_buffer_hours', sw.end_buffer_hours
                ) ORDER BY sw.start_time) AS shifts
              FROM special_shifts_weekday sw
              WHERE sw.user_id = u.id AND sw.is_active = TRUE
              GROUP BY sw.weekday, sw.shift_group_id, sw.shift_start_date
            ) sub
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
  console.log('rpc_list_employee_weekday_shifts updated (grouped).');

  // ============================================================
  // 8. RPC: Add special date shift multi
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_special_date_shift_multi(
      p_user_id UUID,
      p_start_date DATE,
      p_end_date DATE,
      p_shifts JSONB,
      p_start_buffer_hours NUMERIC DEFAULT 3,
      p_end_buffer_hours NUMERIC DEFAULT 3,
      p_total_hours NUMERIC DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_group_id UUID;
      v_shift JSONB;
      v_count INTEGER := 0;
      v_days INTEGER;
    BEGIN
      IF p_end_date < p_start_date THEN
        RETURN json_build_object('success', false, 'message', 'End date cannot be before start date.');
      END IF;

      v_days := (p_end_date - p_start_date) + 1;
      v_group_id := gen_random_uuid();

      FOR v_shift IN SELECT * FROM jsonb_array_elements(p_shifts)
      LOOP
        INSERT INTO special_shifts_date (
          user_id, shift_group_id, start_date, end_date, total_days,
          start_time, end_time, is_next_day,
          start_buffer_hours, end_buffer_hours, total_hours, is_active
        ) VALUES (
          p_user_id,
          v_group_id,
          p_start_date,
          p_end_date,
          v_days,
          (v_shift->>'start_time')::TIME,
          (v_shift->>'end_time')::TIME,
          COALESCE((v_shift->>'is_next_day')::BOOLEAN, FALSE),
          p_start_buffer_hours,
          p_end_buffer_hours,
          COALESCE((v_shift->>'total_hours')::NUMERIC, 0),
          TRUE
        );
        v_count := v_count + 1;
      END LOOP;

      RETURN json_build_object('success', true, 'shift_group_id', v_group_id, 'shifts_added', v_count, 'total_days', v_days, 'total_hours', p_total_hours);
    END;
    $$
  `);
  console.log('rpc_add_special_date_shift_multi created.');

  // ============================================================
  // 9. RPC: List special date shifts (updated with sub-shift arrays)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_special_date_shifts()
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
          g.shift_group_id AS id,
          g.user_id,
          e.employee_code,
          u.full_name,
          g.start_date,
          g.end_date,
          g.total_days,
          g.total_hours,
          g.created_at,
          g.shifts
        FROM (
          SELECT
            sd.shift_group_id,
            sd.user_id,
            MIN(sd.start_date) AS start_date,
            MAX(sd.end_date) AS end_date,
            MAX(sd.total_days) AS total_days,
            SUM(sd.total_hours) AS total_hours,
            MIN(sd.created_at) AS created_at,
            json_agg(json_build_object(
              'id', sd.id,
              'start_time', to_char(sd.start_time, 'HH12:MI AM'),
              'end_time', to_char(sd.end_time, 'HH12:MI AM'),
              'is_next_day', sd.is_next_day,
              'total_hours', sd.total_hours
            ) ORDER BY sd.start_time) AS shifts
          FROM special_shifts_date sd
          WHERE sd.is_active = TRUE
          GROUP BY sd.shift_group_id, sd.user_id
        ) g
        JOIN users u ON u.id = g.user_id
        JOIN employee_master e ON e.user_id = g.user_id
        ORDER BY g.start_date DESC
      ) t;

      RETURN json_build_object('success', true, 'data', COALESCE(v_result, '[]'::JSON));
    END;
    $$
  `);
  console.log('rpc_list_special_date_shifts updated (grouped).');

  // ============================================================
  // 10. RPC: Delete special date shift group
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_special_date_shift(p_shift_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_group_id UUID;
    BEGIN
      -- p_shift_id is now the shift_group_id
      -- Try as group_id first
      SELECT shift_group_id INTO v_group_id
      FROM special_shifts_date
      WHERE shift_group_id = p_shift_id AND is_active = TRUE
      LIMIT 1;

      IF v_group_id IS NOT NULL THEN
        UPDATE special_shifts_date SET is_active = FALSE, updated_at = NOW()
        WHERE shift_group_id = v_group_id;
        RETURN json_build_object('success', true);
      END IF;

      -- Fallback: try as individual id
      SELECT shift_group_id INTO v_group_id
      FROM special_shifts_date
      WHERE id = p_shift_id AND is_active = TRUE;

      IF v_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Shift not found.');
      END IF;

      UPDATE special_shifts_date SET is_active = FALSE, updated_at = NOW()
      WHERE shift_group_id = v_group_id;

      RETURN json_build_object('success', true);
    END;
    $$
  `);
  console.log('rpc_delete_special_date_shift updated (group-aware).');

  // ============================================================
  // 11. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_add_regular_shift_multi(UUID, JSONB, NUMERIC, NUMERIC, NUMERIC, DATE) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_change_regular_shift_multi(UUID, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_add_weekday_shift_multi(UUID, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, DATE) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_change_weekday_shift_multi(UUID, TEXT, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_add_special_date_shift_multi(UUID, DATE, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_employee_shifts() TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_employee_weekday_shifts() TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_special_date_shifts() TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_delete_special_date_shift(UUID) TO anon, authenticated`);
  console.log('Permissions granted.');

  // Reload PostgREST schema cache
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
