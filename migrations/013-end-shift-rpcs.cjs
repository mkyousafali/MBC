require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. RPC: End a regular shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_end_regular_shift(
      p_user_id UUID,
      p_end_date DATE
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_shift_id UUID;
    BEGIN
      IF p_end_date IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'End date is required.');
      END IF;

      SELECT id INTO v_shift_id
      FROM regular_shifts
      WHERE user_id = p_user_id AND is_active = TRUE
      ORDER BY shift_start_date DESC
      LIMIT 1;

      IF v_shift_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No active shift found.');
      END IF;

      UPDATE regular_shifts
      SET shift_end_date = p_end_date,
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = v_shift_id;

      RETURN json_build_object('success', true, 'shift_id', v_shift_id);
    END;
    $$
  `);
  console.log('rpc_end_regular_shift created.');

  // ============================================================
  // 2. RPC: End a weekday shift
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_end_weekday_shift(
      p_user_id UUID,
      p_weekday TEXT,
      p_end_date DATE
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_shift_id UUID;
    BEGIN
      IF p_end_date IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'End date is required.');
      END IF;

      SELECT id INTO v_shift_id
      FROM special_shifts_weekday
      WHERE user_id = p_user_id AND weekday = p_weekday AND is_active = TRUE
      ORDER BY shift_start_date DESC
      LIMIT 1;

      IF v_shift_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No active weekday shift found for ' || p_weekday || '.');
      END IF;

      UPDATE special_shifts_weekday
      SET shift_end_date = p_end_date,
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = v_shift_id;

      RETURN json_build_object('success', true, 'shift_id', v_shift_id);
    END;
    $$
  `);
  console.log('rpc_end_weekday_shift created.');

  // ============================================================
  // 3. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_end_regular_shift(UUID, DATE) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_end_weekday_shift(UUID, TEXT, DATE) TO anon, authenticated`);
  console.log('Permissions granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
