require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. Add qr_secret to branches table
  // ============================================================
  await client.query(`
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS qr_secret UUID NOT NULL DEFAULT gen_random_uuid()
  `);
  console.log('qr_secret column added to branches.');

  // ============================================================
  // 2. Register app_resource for Security Code window
  // ============================================================
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('hr.operations.security_code', 'HR', 'Operations', 'Security Code', '🔐', 'SecurityCodeWindow', 30)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('app_resource registered.');

  // ============================================================
  // 3. RPC: Get QR secret for a branch (authorized users only)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_qr_secret(p_branch_id UUID DEFAULT NULL)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_secret UUID;
      v_branch_id UUID;
      v_branch_name TEXT;
    BEGIN
      -- If no branch_id provided, use the first branch
      IF p_branch_id IS NULL THEN
        SELECT id, branch_name, qr_secret INTO v_branch_id, v_branch_name, v_secret
        FROM branches WHERE is_active = TRUE
        ORDER BY created_at ASC LIMIT 1;
      ELSE
        SELECT id, branch_name, qr_secret INTO v_branch_id, v_branch_name, v_secret
        FROM branches WHERE id = p_branch_id AND is_active = TRUE;
      END IF;

      IF v_secret IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Branch not found or inactive.');
      END IF;

      RETURN json_build_object(
        'success', true,
        'branch_id', v_branch_id,
        'branch_name', v_branch_name,
        'secret', v_secret
      );
    END;
    $$
  `);
  console.log('rpc_get_qr_secret created.');

  // ============================================================
  // 4. RPC: Verify attendance code
  //    Checks if the provided code matches current or previous window
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

      -- Current 5-second window
      v_current_window := floor(extract(epoch from now()) / 5)::BIGINT;

      -- Generate expected codes for current and previous window (±1 window tolerance)
      v_expected_code := left(encode(digest(v_secret::TEXT || v_current_window::TEXT, 'sha256'), 'hex'), 8);
      v_prev_code := left(encode(digest(v_secret::TEXT || (v_current_window - 1)::TEXT, 'sha256'), 'hex'), 8);

      IF p_code = v_expected_code OR p_code = v_prev_code THEN
        RETURN json_build_object('success', true, 'valid', true);
      ELSE
        RETURN json_build_object('success', true, 'valid', false, 'message', 'Code expired or invalid.');
      END IF;
    END;
    $$
  `);
  console.log('rpc_verify_attendance_code created.');

  // ============================================================
  // 5. RPC: Regenerate QR secret for a branch
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_regenerate_qr_secret(p_branch_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_new_secret UUID;
    BEGIN
      v_new_secret := gen_random_uuid();
      UPDATE branches SET qr_secret = v_new_secret WHERE id = p_branch_id;
      RETURN json_build_object('success', true, 'new_secret', v_new_secret);
    END;
    $$
  `);
  console.log('rpc_regenerate_qr_secret created.');

  // ============================================================
  // 6. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_get_qr_secret(UUID) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_verify_attendance_code(UUID, TEXT, BIGINT) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_regenerate_qr_secret(UUID) TO anon, authenticated`);
  console.log('Permissions granted.');

  // Reload PostgREST schema cache
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema cache reloaded.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
