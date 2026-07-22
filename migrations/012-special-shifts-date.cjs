require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. SPECIAL_SHIFTS_DATE table
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS special_shifts_date (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date      DATE NOT NULL,
      end_date        DATE NOT NULL,
      total_days      INTEGER NOT NULL DEFAULT 1,
      start_time      TIME NOT NULL,
      end_time        TIME NOT NULL,
      is_next_day     BOOLEAN NOT NULL DEFAULT FALSE,
      start_buffer_hours NUMERIC(4,2) NOT NULL DEFAULT 3,
      end_buffer_hours   NUMERIC(4,2) NOT NULL DEFAULT 3,
      total_hours     NUMERIC(5,2) NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('special_shifts_date table created.');

  await client.query(`CREATE INDEX IF NOT EXISTS idx_special_shifts_date_user ON special_shifts_date(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_special_shifts_date_dates ON special_shifts_date(start_date, end_date)`);
  console.log('Indexes created.');

  // ============================================================
  // 2. RPC: Add special date shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_special_date_shift(
      p_user_id UUID,
      p_start_date DATE,
      p_end_date DATE,
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
      v_new_id UUID;
      v_days INTEGER;
    BEGIN
      IF p_end_date < p_start_date THEN
        RETURN json_build_object('success', false, 'message', 'End date cannot be before start date.');
      END IF;

      v_days := (p_end_date - p_start_date) + 1;

      INSERT INTO special_shifts_date (user_id, start_date, end_date, total_days, start_time, end_time, is_next_day, start_buffer_hours, end_buffer_hours, total_hours)
      VALUES (
        p_user_id,
        p_start_date,
        p_end_date,
        v_days,
        p_start_time::TIME,
        p_end_time::TIME,
        p_is_next_day,
        p_start_buffer_hours,
        p_end_buffer_hours,
        p_total_hours
      )
      RETURNING id INTO v_new_id;

      RETURN json_build_object('success', true, 'shift_id', v_new_id, 'total_days', v_days);
    END;
    $$
  `);
  console.log('rpc_add_special_date_shift created.');

  // ============================================================
  // 3. RPC: Delete special date shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_special_date_shift(p_shift_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      DELETE FROM special_shifts_date WHERE id = p_shift_id;
      RETURN json_build_object('success', true);
    END;
    $$
  `);
  console.log('rpc_delete_special_date_shift created.');

  // ============================================================
  // 4. RPC: List all special date shifts
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
          sd.id,
          sd.user_id,
          e.employee_code,
          u.full_name,
          sd.start_date,
          sd.end_date,
          sd.total_days,
          to_char(sd.start_time, 'HH12:MI AM') AS start_time,
          to_char(sd.end_time, 'HH12:MI AM') AS end_time,
          sd.is_next_day,
          sd.start_buffer_hours,
          sd.end_buffer_hours,
          sd.total_hours,
          sd.created_at
        FROM special_shifts_date sd
        JOIN users u ON u.id = sd.user_id
        JOIN employee_master e ON e.user_id = sd.user_id
        WHERE sd.is_active = TRUE
        ORDER BY sd.start_date DESC, u.full_name ASC
      ) t;

      RETURN json_build_object('success', true, 'data', COALESCE(v_result, '[]'::JSON));
    END;
    $$
  `);
  console.log('rpc_list_special_date_shifts created.');

  // ============================================================
  // 5. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_add_special_date_shift(UUID, DATE, DATE, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_delete_special_date_shift(UUID) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_special_date_shifts() TO anon, authenticated`);
  console.log('Permissions granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
