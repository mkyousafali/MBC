require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. AUDIT_LOGS table
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         TEXT NOT NULL,
      user_name       TEXT NOT NULL,
      action          TEXT NOT NULL,
      resource_type   TEXT NOT NULL,
      resource_id     TEXT NULL,
      resource_label  TEXT NULL,
      details         JSONB NULL,
      ip_address      TEXT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('audit_logs table created.');

  // Indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`);
  console.log('Indexes created.');

  // ============================================================
  // 2. RPC: Write audit log entry
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_write_audit_log(
      p_user_id TEXT,
      p_user_name TEXT,
      p_action TEXT,
      p_resource_type TEXT,
      p_resource_id TEXT DEFAULT NULL,
      p_resource_label TEXT DEFAULT NULL,
      p_details JSONB DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      INSERT INTO audit_logs (user_id, user_name, action, resource_type, resource_id, resource_label, details)
      VALUES (p_user_id, p_user_name, p_action, p_resource_type, p_resource_id, p_resource_label, p_details);
      RETURN jsonb_build_object('success', true);
    END;
    $$
  `);
  console.log('rpc_write_audit_log created.');

  // ============================================================
  // 3. RPC: List audit logs (with search, filters, pagination)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_audit_logs(
      p_search TEXT DEFAULT '',
      p_action_filter TEXT DEFAULT '',
      p_resource_filter TEXT DEFAULT '',
      p_user_filter TEXT DEFAULT '',
      p_date_from TIMESTAMPTZ DEFAULT NULL,
      p_date_to TIMESTAMPTZ DEFAULT NULL,
      p_limit INT DEFAULT 50,
      p_offset INT DEFAULT 0
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_total INT;
      v_data JSONB;
    BEGIN
      SELECT COUNT(*) INTO v_total
      FROM audit_logs
      WHERE (p_search = '' OR
             user_name ILIKE '%' || p_search || '%' OR
             resource_label ILIKE '%' || p_search || '%' OR
             resource_type ILIKE '%' || p_search || '%' OR
             action ILIKE '%' || p_search || '%')
        AND (p_action_filter = '' OR action = p_action_filter)
        AND (p_resource_filter = '' OR resource_type = p_resource_filter)
        AND (p_user_filter = '' OR user_id = p_user_filter OR user_name ILIKE '%' || p_user_filter || '%')
        AND (p_date_from IS NULL OR created_at >= p_date_from)
        AND (p_date_to IS NULL OR created_at <= p_date_to);

      SELECT jsonb_agg(row_to_json(r))
      INTO v_data
      FROM (
        SELECT id, user_id, user_name, action, resource_type, resource_id,
               resource_label, details, created_at
        FROM audit_logs
        WHERE (p_search = '' OR
               user_name ILIKE '%' || p_search || '%' OR
               resource_label ILIKE '%' || p_search || '%' OR
               resource_type ILIKE '%' || p_search || '%' OR
               action ILIKE '%' || p_search || '%')
          AND (p_action_filter = '' OR action = p_action_filter)
          AND (p_resource_filter = '' OR resource_type = p_resource_filter)
          AND (p_user_filter = '' OR user_id = p_user_filter OR user_name ILIKE '%' || p_user_filter || '%')
          AND (p_date_from IS NULL OR created_at >= p_date_from)
          AND (p_date_to IS NULL OR created_at <= p_date_to)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) r;

      RETURN jsonb_build_object('total', v_total, 'data', COALESCE(v_data, '[]'::jsonb));
    END;
    $$
  `);
  console.log('rpc_list_audit_logs created.');

  // ============================================================
  // 4. Register in app_resources
  // ============================================================
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('settings.reports.audit_logs', 'Settings', 'Reports', 'Audit Logs', '📜', 'AuditLogsWindow', 100)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('app_resources: Audit Logs registered.');

  // ============================================================
  // 5. Grant permissions
  // ============================================================
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_write_audit_log(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated`);
  await client.query(`GRANT EXECUTE ON FUNCTION rpc_list_audit_logs(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO anon, authenticated`);
  console.log('Permissions granted.');

  // ============================================================
  // 6. Reload PostgREST
  // ============================================================
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log('PostgREST schema reload notified.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
