require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // RPC: Get today's shift for a user (priority: special date > special weekday > regular)
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_today_shift(p_user_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_today DATE := CURRENT_DATE;
      v_weekday TEXT;
      v_result JSON;
    BEGIN
      -- Get weekday name (lowercase)
      v_weekday := lower(to_char(v_today, 'FMDay'));

      -- 1. Check special date shift first
      SELECT json_build_object(
        'type', 'special_date',
        'shifts', (
          SELECT json_agg(json_build_object(
            'start_time', to_char(sd2.start_time, 'HH12:MI AM'),
            'end_time', to_char(sd2.end_time, 'HH12:MI AM'),
            'is_next_day', sd2.is_next_day,
            'total_hours', sd2.total_hours
          ) ORDER BY sd2.start_time)
          FROM special_shifts_date sd2
          WHERE sd2.shift_group_id = sd.shift_group_id AND sd2.is_active = TRUE
        ),
        'total_hours', (
          SELECT SUM(sd3.total_hours)
          FROM special_shifts_date sd3
          WHERE sd3.shift_group_id = sd.shift_group_id AND sd3.is_active = TRUE
        ),
        'label', 'Special (Date)'
      ) INTO v_result
      FROM special_shifts_date sd
      WHERE sd.user_id = p_user_id
        AND sd.is_active = TRUE
        AND v_today BETWEEN sd.start_date AND sd.end_date
      LIMIT 1;

      IF v_result IS NOT NULL THEN
        RETURN json_build_object('success', true, 'data', v_result);
      END IF;

      -- 2. Check special weekday shift
      SELECT json_build_object(
        'type', 'special_weekday',
        'shifts', (
          SELECT json_agg(json_build_object(
            'start_time', to_char(sw2.start_time, 'HH12:MI AM'),
            'end_time', to_char(sw2.end_time, 'HH12:MI AM'),
            'is_next_day', sw2.is_next_day,
            'total_hours', sw2.total_hours
          ) ORDER BY sw2.start_time)
          FROM special_shifts_weekday sw2
          WHERE sw2.shift_group_id = sw.shift_group_id AND sw2.is_active = TRUE
        ),
        'total_hours', (
          SELECT SUM(sw3.total_hours)
          FROM special_shifts_weekday sw3
          WHERE sw3.shift_group_id = sw.shift_group_id AND sw3.is_active = TRUE
        ),
        'weekday', v_weekday,
        'label', 'Special (' || initcap(v_weekday) || ')'
      ) INTO v_result
      FROM special_shifts_weekday sw
      WHERE sw.user_id = p_user_id
        AND sw.weekday = v_weekday
        AND sw.is_active = TRUE
      LIMIT 1;

      IF v_result IS NOT NULL THEN
        RETURN json_build_object('success', true, 'data', v_result);
      END IF;

      -- 3. Check regular shift
      SELECT json_build_object(
        'type', 'regular',
        'shifts', (
          SELECT json_agg(json_build_object(
            'start_time', to_char(rs2.start_time, 'HH12:MI AM'),
            'end_time', to_char(rs2.end_time, 'HH12:MI AM'),
            'is_next_day', rs2.is_next_day,
            'total_hours', rs2.total_hours
          ) ORDER BY rs2.start_time)
          FROM regular_shifts rs2
          WHERE rs2.shift_group_id = rs.shift_group_id AND rs2.is_active = TRUE
        ),
        'total_hours', (
          SELECT SUM(rs3.total_hours)
          FROM regular_shifts rs3
          WHERE rs3.shift_group_id = rs.shift_group_id AND rs3.is_active = TRUE
        ),
        'label', 'Regular'
      ) INTO v_result
      FROM regular_shifts rs
      WHERE rs.user_id = p_user_id
        AND rs.is_active = TRUE
      LIMIT 1;

      IF v_result IS NOT NULL THEN
        RETURN json_build_object('success', true, 'data', v_result);
      END IF;

      -- 4. No shift found
      RETURN json_build_object('success', true, 'data', null);
    END;
    $$
  `);
  console.log('rpc_get_today_shift created.');

  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_today_shift(UUID) TO anon, authenticated`);
  console.log('Permission granted.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
