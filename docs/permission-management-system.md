# Permission Management System

## Purpose
Controls which navigation buttons, pages, and actions each team member can access in MBC One OS. Ensures security through both UI filtering and backend validation.

## Architecture

### Login Types
| Type | Table | Identifier | Permissions |
|------|-------|-----------|-------------|
| Super Admin | `super_admins` | `is_super_admin: true` in auth store | Full unrestricted access — bypasses all checks |
| Normal User | `users` + `employee_master` | `user_id` UUID | Controlled by `user_permissions` rows |

### Flow
1. User logs in → `setTeamUser()` stores identity with `is_super_admin` flag
2. For normal users, `rpc_get_my_permissions` loads effective permissions → stored in `userPermissions` store + localStorage
3. Sidebar reads `userPermissions` to build visible navigation tree
4. Windows/pages check permissions via `canView()`, `canAdd()`, `canEdit()`, `canDelete()` helpers
5. Super Admin always returns `true` for all permission checks

## Database Tables

### `app_resources`
Registry of all navigable buttons/pages.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `resource_key` | TEXT UNIQUE | Stable identifier e.g. `settings.management.users` |
| `main_section` | TEXT | Top-level nav section e.g. "Settings" |
| `sub_section` | TEXT | Sub-section e.g. "Management" |
| `button_name` | TEXT | Display name e.g. "Users" |
| `icon` | TEXT | Emoji icon |
| `component` | TEXT | Svelte component name e.g. "UsersWindow" |
| `display_order` | INT | Sort order |
| `is_active` | BOOLEAN | Whether resource is active |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### `user_permissions`
Per-user per-resource CRUD permission flags.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `user_id` | UUID FK→users | The user |
| `resource_id` | UUID FK→app_resources | The resource/button |
| `can_view` | BOOLEAN | Can see button and open page (read-only) |
| `can_add` | BOOLEAN | Can create records |
| `can_edit` | BOOLEAN | Can edit records |
| `can_delete` | BOOLEAN | Can delete records |
| `created_at` | TIMESTAMPTZ | When permission was created |
| `created_by` | UUID | Admin who created |
| `updated_at` | TIMESTAMPTZ | Last update |
| `updated_by` | UUID | Admin who last updated |

**Constraints:**
- `UNIQUE(user_id, resource_id)` — prevents duplicate rows
- `CHECK chk_view_required` — enforces: if `can_view = FALSE` then all others must be FALSE
- **Trigger** `trg_permission_view_dep` — auto-enforces: disabling view disables all; enabling add/edit/delete enables view

## Permission Dependencies

| Action | Requires View | Auto-enables View |
|--------|:---:|:---:|
| View only | — | — |
| Add | ✓ | ✓ |
| Edit | ✓ | ✓ |
| Delete | ✓ | ✓ |

- Disabling View automatically disables Add, Edit, Delete (trigger + UI)
- Enabling Add, Edit, or Delete automatically enables View (trigger + UI)

## Navigation Filtering Rules
- A **button** is shown only when the user has `can_view` for that resource
- A **sub-section** is shown only when it contains at least one visible button
- A **main section** is shown only when it contains at least one visible sub-section
- Empty sections/sub-sections are hidden
- **Super Admin** sees all sections, sub-sections, and buttons regardless of permission rows

## RPC Functions

| Function | Parameters | Returns | Purpose |
|----------|-----------|---------|---------|
| `rpc_list_app_resources()` | none | JSONB array | List all active resources |
| `rpc_get_user_permissions(p_user_id)` | UUID | JSONB array | All resources with user's permission flags |
| `rpc_save_permission(...)` | user_id, resource_id, flags, admin_id | JSONB | Upsert single permission |
| `rpc_bulk_save_permissions(...)` | user_id, JSONB array, admin_id | JSONB | Upsert multiple in transaction |
| `rpc_reset_user_permissions(p_user_id)` | UUID | JSONB | Delete all permissions for user |
| `rpc_get_my_permissions(p_user_id)` | UUID | JSONB array | Effective permissions (view=true only) |
| `rpc_check_permission(...)` | user_id, resource_key, action | BOOLEAN | Check single permission |
| `rpc_list_users_for_permissions()` | none | JSONB array | Active users with job titles |

All functions use `SECURITY DEFINER` and are granted to `anon` + `authenticated`.

## Frontend Integration

### Auth Store (`src/lib/stores/auth.ts`)

```typescript
// Check functions — all return true for Super Admin
canView('settings.management.users')   // Can see the button & open page
canAdd('settings.management.users')    // Can create records
canEdit('settings.management.users')   // Can edit records
canDelete('settings.management.users') // Can delete records
isSuperAdmin()                         // Is current user super admin?
getPermission('resource.key')          // Full permission object
```

### Sidebar (`DesktopSidebar.svelte`)
The sidebar uses a data-driven `navItems` array. It filters items using `canView()` and groups them into sections/sub-sections. Empty groups are automatically hidden.

### Adding a New Button/Page

1. **Database**: Insert into `app_resources`:
   ```sql
   INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
   VALUES ('settings.operations.inventory', 'Settings', 'Operations', 'Inventory', '📦', 'InventoryWindow', 40);
   ```

2. **Sidebar**: Add to `navItems` array in `DesktopSidebar.svelte`:
   ```typescript
   { key: 'settings.operations.inventory', section: 'Settings', sub: 'Operations', id: 'inventory', title: 'Inventory', icon: '📦', component: 'InventoryWindow' }
   ```

3. **Layout**: Import and register component in `+layout.svelte`:
   ```typescript
   import InventoryWindow from '...';
   const componentMap = { ..., InventoryWindow };
   ```

4. **Protect actions** in the window component:
   ```typescript
   import { canAdd, canEdit, canDelete } from '$lib/stores/auth';
   // Hide/disable buttons based on permissions
   ```

### Protecting Create/Update/Delete

In any window component:
```svelte
{#if canAdd('settings.management.users')}
  <button onclick={createRecord}>Add New</button>
{/if}

{#if canEdit('settings.management.users')}
  <button onclick={editRecord}>Edit</button>
{/if}

{#if canDelete('settings.management.users')}
  <button onclick={deleteRecord}>Delete</button>
{/if}
```

## Migration

File: `migrations/007-permissions.cjs`

Run: `node migrations/007-permissions.cjs`

Seeds 3 resources: Users, Branches, Permissions.

## Security Considerations
- All database access via RPC functions (SECURITY DEFINER)
- No direct table queries from client
- Check constraint prevents invalid permission states
- Trigger enforces view dependency automatically
- Super Admin bypass is checked via `is_super_admin` flag set during login
- Super Admin permissions cannot be restricted through the UI
- Permission management is only accessible to Super Admin (or users with permissions.view permission)
- localStorage stores permissions for fast page loads; refreshed on login

## Troubleshooting

| Issue | Solution |
|-------|---------|
| User sees no menu items | Check `user_permissions` rows exist with `can_view = true` |
| 404 on RPC call | Run `NOTIFY pgrst, 'reload schema'` via migration |
| Permissions not updating | User needs to log out and log back in, or admin saves permissions |
| Super Admin can't see items | Check `is_super_admin` flag in localStorage `mbc_team_user` |
