require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. APP_RESOURCES — registry of all navigable buttons/pages
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_resources (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_key    TEXT NOT NULL UNIQUE,
      main_section    TEXT NOT NULL,
      sub_section     TEXT NOT NULL,
      button_name     TEXT NOT NULL,
      icon            TEXT NOT NULL DEFAULT '',
      component       TEXT NOT NULL DEFAULT '',
      display_order   INT NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('app_resources table created.');

  // ============================================================
  // 2. USER_PERMISSIONS — per-user per-resource CRUD flags
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource_id     UUID NOT NULL REFERENCES app_resources(id) ON DELETE CASCADE,
      can_view        BOOLEAN NOT NULL DEFAULT FALSE,
      can_add         BOOLEAN NOT NULL DEFAULT FALSE,
      can_edit        BOOLEAN NOT NULL DEFAULT FALSE,
      can_delete      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by      UUID NULL,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by      UUID NULL,
      UNIQUE(user_id, resource_id)
    )
  `);
  console.log('user_permissions table created.');

  // Index for fast permission lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_permissions_resource_id ON user_permissions(resource_id)
  `);
  console.log('Indexes created.');

  // ============================================================
  // 3. CHECK CONSTRAINT — no add/edit/delete without view
  // ============================================================
  // Drop if exists first to make idempotent
  await client.query(`
    ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS chk_view_required
  `);
  await client.query(`
    ALTER TABLE user_permissions ADD CONSTRAINT chk_view_required
      CHECK (
        (can_view = TRUE) OR
        (can_add = FALSE AND can_edit = FALSE AND can_delete = FALSE)
      )
  `);
  console.log('Check constraint chk_view_required added.');

  // ============================================================
  // 4. TRIGGER — auto-enforce view dependency on update
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION trg_enforce_view_dependency()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- If view turned off, force all others off
      IF NEW.can_view = FALSE THEN
        NEW.can_add := FALSE;
        NEW.can_edit := FALSE;
        NEW.can_delete := FALSE;
      END IF;
      -- If any modifier turned on, force view on
      IF NEW.can_add = TRUE OR NEW.can_edit = TRUE OR NEW.can_delete = TRUE THEN
        NEW.can_view := TRUE;
      END IF;
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$
  `);
  await client.query(`
    DROP TRIGGER IF EXISTS trg_permission_view_dep ON user_permissions
  `);
  await client.query(`
    CREATE TRIGGER trg_permission_view_dep
      BEFORE INSERT OR UPDATE ON user_permissions
      FOR EACH ROW EXECUTE FUNCTION trg_enforce_view_dependency()
  `);
  console.log('Trigger trg_permission_view_dep created.');

  // ============================================================
  // 5. SEED app_resources with current navigation buttons
  // ============================================================
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES
      ('settings.management.users', 'Settings', 'Management', 'Users', '👥', 'UsersWindow', 10),
      ('settings.management.branches', 'Settings', 'Management', 'Branches', '🏢', 'BranchesWindow', 20),
      ('settings.management.permissions', 'Settings', 'Management', 'Permissions', '🔐', 'PermissionsWindow', 30)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section,
      sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name,
      icon = EXCLUDED.icon,
      component = EXCLUDED.component,
      display_order = EXCLUDED.display_order
  `);
  console.log('app_resources seeded (3 buttons).');

  // ============================================================
  // 6. RPC: List all app resources (for permissions UI)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_app_resources()
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN (
        SELECT jsonb_agg(row_to_json(r) ORDER BY r.display_order)
        FROM (
          SELECT id, resource_key, main_section, sub_section, button_name, icon, component, display_order
          FROM app_resources
          WHERE is_active = TRUE
          ORDER BY display_order
        ) r
      );
    END;
    $$
  `);
  console.log('rpc_list_app_resources created.');

  // ============================================================
  // 7. RPC: Get user permissions (all resources for one user)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_user_permissions(p_user_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN (
        SELECT jsonb_agg(row_to_json(p))
        FROM (
          SELECT up.id, up.resource_id, up.can_view, up.can_add, up.can_edit, up.can_delete,
                 ar.resource_key, ar.main_section, ar.sub_section, ar.button_name, ar.icon
          FROM app_resources ar
          LEFT JOIN user_permissions up ON up.resource_id = ar.id AND up.user_id = p_user_id
          WHERE ar.is_active = TRUE
          ORDER BY ar.display_order
        ) p
      );
    END;
    $$
  `);
  console.log('rpc_get_user_permissions created.');

  // ============================================================
  // 8. RPC: Save (upsert) a single permission row
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_save_permission(
      p_user_id UUID,
      p_resource_id UUID,
      p_can_view BOOLEAN,
      p_can_add BOOLEAN,
      p_can_edit BOOLEAN,
      p_can_delete BOOLEAN,
      p_admin_id UUID DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      INSERT INTO user_permissions (user_id, resource_id, can_view, can_add, can_edit, can_delete, created_by, updated_by)
      VALUES (p_user_id, p_resource_id, p_can_view, p_can_add, p_can_edit, p_can_delete, p_admin_id, p_admin_id)
      ON CONFLICT (user_id, resource_id) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_add = EXCLUDED.can_add,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete,
        updated_by = p_admin_id,
        updated_at = NOW();

      RETURN jsonb_build_object('success', true);
    END;
    $$
  `);
  console.log('rpc_save_permission created.');

  // ============================================================
  // 9. RPC: Bulk save permissions for one user (transaction)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_bulk_save_permissions(
      p_user_id UUID,
      p_permissions JSONB,
      p_admin_id UUID DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      perm JSONB;
      saved_count INT := 0;
    BEGIN
      FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
      LOOP
        INSERT INTO user_permissions (user_id, resource_id, can_view, can_add, can_edit, can_delete, created_by, updated_by)
        VALUES (
          p_user_id,
          (perm->>'resource_id')::UUID,
          COALESCE((perm->>'can_view')::BOOLEAN, FALSE),
          COALESCE((perm->>'can_add')::BOOLEAN, FALSE),
          COALESCE((perm->>'can_edit')::BOOLEAN, FALSE),
          COALESCE((perm->>'can_delete')::BOOLEAN, FALSE),
          p_admin_id,
          p_admin_id
        )
        ON CONFLICT (user_id, resource_id) DO UPDATE SET
          can_view = COALESCE((perm->>'can_view')::BOOLEAN, FALSE),
          can_add = COALESCE((perm->>'can_add')::BOOLEAN, FALSE),
          can_edit = COALESCE((perm->>'can_edit')::BOOLEAN, FALSE),
          can_delete = COALESCE((perm->>'can_delete')::BOOLEAN, FALSE),
          updated_by = p_admin_id,
          updated_at = NOW();
        saved_count := saved_count + 1;
      END LOOP;

      RETURN jsonb_build_object('success', true, 'saved', saved_count);
    END;
    $$
  `);
  console.log('rpc_bulk_save_permissions created.');

  // ============================================================
  // 10. RPC: Reset (delete) all permissions for a user
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_reset_user_permissions(p_user_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      deleted_count INT;
    BEGIN
      DELETE FROM user_permissions WHERE user_id = p_user_id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN jsonb_build_object('success', true, 'deleted', deleted_count);
    END;
    $$
  `);
  console.log('rpc_reset_user_permissions created.');

  // ============================================================
  // 11. RPC: Get effective permissions for logged-in user
  //     Returns only resources with can_view=true
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_my_permissions(p_user_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN (
        SELECT jsonb_agg(row_to_json(p))
        FROM (
          SELECT ar.resource_key, ar.main_section, ar.sub_section, ar.button_name,
                 ar.icon, ar.component, ar.display_order,
                 up.can_view, up.can_add, up.can_edit, up.can_delete
          FROM user_permissions up
          JOIN app_resources ar ON ar.id = up.resource_id
          WHERE up.user_id = p_user_id
            AND up.can_view = TRUE
            AND ar.is_active = TRUE
          ORDER BY ar.display_order
        ) p
      );
    END;
    $$
  `);
  console.log('rpc_get_my_permissions created.');

  // ============================================================
  // 12. RPC: Check specific permission for a resource
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_check_permission(
      p_user_id UUID,
      p_resource_key TEXT,
      p_action TEXT
    )
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_result BOOLEAN := FALSE;
    BEGIN
      SELECT
        CASE p_action
          WHEN 'view' THEN up.can_view
          WHEN 'add' THEN up.can_add
          WHEN 'edit' THEN up.can_edit
          WHEN 'delete' THEN up.can_delete
          ELSE FALSE
        END
      INTO v_result
      FROM user_permissions up
      JOIN app_resources ar ON ar.id = up.resource_id
      WHERE up.user_id = p_user_id
        AND ar.resource_key = p_resource_key;

      RETURN COALESCE(v_result, FALSE);
    END;
    $$
  `);
  console.log('rpc_check_permission created.');

  // ============================================================
  // 13. RPC: List users for permission assignment (active users)
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_users_for_permissions()
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN (
        SELECT jsonb_agg(row_to_json(u) ORDER BY u.full_name)
        FROM (
          SELECT u.id, u.full_name, u.username, u.is_active,
                 em.employee_code,
                 jt.title_name as job_title
          FROM users u
          LEFT JOIN employee_master em ON em.user_id = u.id
          LEFT JOIN job_titles jt ON jt.id = em.job_title_id
          WHERE u.is_active = TRUE
          ORDER BY u.full_name
        ) u
      );
    END;
    $$
  `);
  console.log('rpc_list_users_for_permissions created.');

  // ============================================================
  // 14. Grant permissions to anon + authenticated
  // ============================================================
  const funcs = [
    'rpc_list_app_resources()',
    'rpc_get_user_permissions(UUID)',
    'rpc_save_permission(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, UUID)',
    'rpc_bulk_save_permissions(UUID, JSONB, UUID)',
    'rpc_reset_user_permissions(UUID)',
    'rpc_get_my_permissions(UUID)',
    'rpc_check_permission(UUID, TEXT, TEXT)',
    'rpc_list_users_for_permissions()'
  ];

  for (const fn of funcs) {
    await client.query(`GRANT EXECUTE ON FUNCTION ${fn} TO anon, authenticated`);
  }
  console.log('All permissions granted.');

  // ============================================================
  // 15. Reload PostgREST schema cache
  // ============================================================
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log('PostgREST schema reload notified.');

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
