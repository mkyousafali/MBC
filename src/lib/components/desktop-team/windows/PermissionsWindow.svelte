<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, isSuperAdmin } from '$lib/stores/auth';
	import { writeAuditLog } from '$lib/utils/audit';

	type AppUser = {
		id: string; full_name: string; username: string;
		is_active: boolean; employee_code: string; job_title: string;
	};

	type PermRow = {
		resource_id: string; resource_key: string;
		main_section: string; sub_section: string; button_name: string; icon: string;
		can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean;
	};

	let activeTab: 'permissions' = $state('permissions');
	let loading = $state(false);
	let saving = $state(false);

	// User selector
	let users = $state<AppUser[]>([]);
	let userSearch = $state('');
	let selectedUser = $state<AppUser | null>(null);
	let userDropdownOpen = $state(false);
	let isSuperAdminUser = $state(false);

	// Permissions
	let permRows = $state<PermRow[]>([]);
	let permRowsOriginalJson = '';
	let hasChanges = $state(false);

	// Filter
	let permSearch = $state('');

	let currentUser = $state<{ user_id: string; is_super_admin: boolean } | null>(null);
	teamUser.subscribe(u => { currentUser = u ? { user_id: u.user_id, is_super_admin: u.is_super_admin } : null; });

	let filteredUsers = $derived(
		users.filter(u => {
			const q = userSearch.toLowerCase();
			return u.full_name.toLowerCase().includes(q) ||
				u.username.toLowerCase().includes(q) ||
				(u.employee_code || '').toLowerCase().includes(q);
		})
	);

	let filteredPerms = $derived(
		permRows.filter(p => {
			if (!permSearch) return true;
			const q = permSearch.toLowerCase();
			return p.main_section.toLowerCase().includes(q) ||
				p.sub_section.toLowerCase().includes(q) ||
				p.button_name.toLowerCase().includes(q);
		})
	);

	// Group permissions by section > subsection
	let groupedPerms = $derived(() => {
		const groups: { section: string; subsections: { name: string; items: PermRow[] }[] }[] = [];
		const sectionMap = new Map<string, Map<string, PermRow[]>>();

		for (const p of filteredPerms) {
			if (!sectionMap.has(p.main_section)) sectionMap.set(p.main_section, new Map());
			const sub = sectionMap.get(p.main_section)!;
			if (!sub.has(p.sub_section)) sub.set(p.sub_section, []);
			sub.get(p.sub_section)!.push(p);
		}

		for (const [section, subs] of sectionMap) {
			const subsections: { name: string; items: PermRow[] }[] = [];
			for (const [name, items] of subs) {
				subsections.push({ name, items });
			}
			groups.push({ section, subsections });
		}
		return groups;
	});

	async function loadUsers() {
		const { data, error } = await supabase.rpc('rpc_list_users_for_permissions');
		if (error) { toasts.add('Failed to load users: ' + error.message, 'error'); return; }
		users = data || [];
	}

	async function selectUser(user: AppUser) {
		// Check if this is a super admin (they're in super_admins table, not users)
		isSuperAdminUser = false;
		selectedUser = user;
		userDropdownOpen = false;
		userSearch = user.full_name;
		hasChanges = false;
		await loadUserPermissions(user.id);
	}

	async function loadUserPermissions(userId: string) {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_get_user_permissions', { p_user_id: userId });
		loading = false;
		if (error) { toasts.add('Failed to load permissions: ' + error.message, 'error'); return; }
		permRows = (data || []).map((p: any) => ({
			resource_id: p.resource_id,
			resource_key: p.resource_key,
			main_section: p.main_section,
			sub_section: p.sub_section,
			button_name: p.button_name,
			icon: p.icon,
			can_view: p.can_view ?? false,
			can_add: p.can_add ?? false,
			can_edit: p.can_edit ?? false,
			can_delete: p.can_delete ?? false
		}));
		permRowsOriginalJson = JSON.stringify(permRows.map(r => ({ key: r.resource_key, v: r.can_view, a: r.can_add, e: r.can_edit, d: r.can_delete })));
	}

	function togglePerm(row: PermRow, field: 'can_view' | 'can_add' | 'can_edit' | 'can_delete') {
		if (isSuperAdminUser) return;
		const newVal = !row[field];

		if (field === 'can_view' && !newVal) {
			// Turning off view → turn off all
			row.can_view = false;
			row.can_add = false;
			row.can_edit = false;
			row.can_delete = false;
		} else if (field !== 'can_view' && newVal) {
			// Turning on add/edit/delete → auto-enable view
			row[field] = true;
			row.can_view = true;
		} else {
			row[field] = newVal;
		}

		hasChanges = true;
		permRows = [...permRows]; // trigger reactivity
	}

	function toggleFullAccess(row: PermRow) {
		if (isSuperAdminUser) return;
		const allOn = row.can_view && row.can_add && row.can_edit && row.can_delete;
		row.can_view = !allOn;
		row.can_add = !allOn;
		row.can_edit = !allOn;
		row.can_delete = !allOn;
		hasChanges = true;
		permRows = [...permRows];
	}

	function selectAll(field: 'can_view' | 'can_add' | 'can_edit' | 'can_delete' | 'all', value: boolean) {
		if (isSuperAdminUser) return;
		for (const row of permRows) {
			if (field === 'all') {
				row.can_view = value;
				row.can_add = value;
				row.can_edit = value;
				row.can_delete = value;
			} else if (field === 'can_view' && !value) {
				row.can_view = false;
				row.can_add = false;
				row.can_edit = false;
				row.can_delete = false;
			} else {
				row[field] = value;
				if (value && field !== 'can_view') row.can_view = true;
			}
		}
		hasChanges = true;
		permRows = [...permRows];
	}

	async function savePermissions() {
		if (!selectedUser || isSuperAdminUser) return;
		saving = true;
		try {
			const payload = permRows.map(r => ({
				resource_id: r.resource_id,
				can_view: r.can_view,
				can_add: r.can_add,
				can_edit: r.can_edit,
				can_delete: r.can_delete
			}));
			const { data, error } = await supabase.rpc('rpc_bulk_save_permissions', {
				p_user_id: selectedUser.id,
				p_permissions: payload,
				p_admin_id: currentUser?.user_id || null
			});
			if (error) throw error;
			hasChanges = false;
			toasts.add(`Permissions saved for ${selectedUser.full_name}`, 'success');

			// Build detailed changes for audit
			const originalPerms: {key:string,v:boolean,a:boolean,e:boolean,d:boolean}[] = JSON.parse(permRowsOriginalJson);
			const changes: {field:string,from?:string,to?:string}[] = [];
			for (const row of permRows) {
				const orig = originalPerms.find(o => o.key === row.resource_key);
				if (!orig) continue;
				const name = row.button_name;
				if (orig.v !== row.can_view) changes.push({ field: `${name} → View`, from: String(orig.v), to: String(row.can_view) });
				if (orig.a !== row.can_add) changes.push({ field: `${name} → Add`, from: String(orig.a), to: String(row.can_add) });
				if (orig.e !== row.can_edit) changes.push({ field: `${name} → Edit`, from: String(orig.e), to: String(row.can_edit) });
				if (orig.d !== row.can_delete) changes.push({ field: `${name} → Delete`, from: String(orig.d), to: String(row.can_delete) });
			}
			writeAuditLog({ action: 'permission_change', resourceType: 'permission', resourceId: selectedUser.id, resourceLabel: selectedUser.full_name, changes });
			permRowsOriginalJson = JSON.stringify(permRows.map(r => ({ key: r.resource_key, v: r.can_view, a: r.can_add, e: r.can_edit, d: r.can_delete })));
		} catch (e: any) {
			toasts.add('Save failed: ' + (e.message || 'Unknown error'), 'error');
		} finally {
			saving = false;
		}
	}

	async function resetPermissions() {
		if (!selectedUser || isSuperAdminUser) return;
		if (!confirm(`Remove all permissions for ${selectedUser.full_name}? This cannot be undone.`)) return;
		saving = true;
		try {
			const { error } = await supabase.rpc('rpc_reset_user_permissions', { p_user_id: selectedUser.id });
			if (error) throw error;
			for (const row of permRows) {
				row.can_view = false; row.can_add = false; row.can_edit = false; row.can_delete = false;
			}
			permRows = [...permRows];
			hasChanges = false;
			toasts.add(`All permissions removed for ${selectedUser.full_name}`, 'success');
			writeAuditLog({ action: 'permission_change', resourceType: 'permission', resourceId: selectedUser.id, resourceLabel: selectedUser.full_name, details: { action: 'reset_all' } });
		} catch (e: any) {
			toasts.add('Reset failed: ' + (e.message || 'Unknown error'), 'error');
		} finally {
			saving = false;
		}
	}

	// Load users on mount
	$effect(() => { loadUsers(); });
</script>

<div class="perm-window">
	<!-- Top bar: user selector + search -->
	<div class="perm-toolbar">
		<div class="user-selector">
			<label class="field-label">Select User</label>
			<div class="user-dropdown-wrap">
				<input
					type="text"
					class="user-search-input"
					placeholder="Search users..."
					bind:value={userSearch}
					onfocus={() => userDropdownOpen = true}
				/>
				{#if userDropdownOpen && filteredUsers.length > 0}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="user-dropdown" onmousedown={(e) => e.preventDefault()}>
						{#each filteredUsers as u}
							<button class="user-option" class:selected={selectedUser?.id === u.id} onclick={() => selectUser(u)}>
								<span class="uo-name">{u.full_name}</span>
								<span class="uo-meta">{u.employee_code || u.username} · {u.job_title || 'No title'}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="perm-search">
			<label class="field-label">Filter</label>
			<input type="text" placeholder="Search buttons..." bind:value={permSearch} class="filter-input" />
		</div>
	</div>

	<!-- Permission table -->
	{#if !selectedUser}
		<div class="empty-state">
			<span class="empty-icon">🔐</span>
			<p>Select a user to manage permissions</p>
		</div>
	{:else if isSuperAdminUser}
		<div class="sa-notice">
			<span class="sa-icon">👑</span>
			<p><strong>{selectedUser.full_name}</strong> is a Super Admin.<br/>Super Admin has unrestricted access to all features and cannot be restricted.</p>
		</div>
	{:else if loading}
		<div class="empty-state"><p>Loading permissions...</p></div>
	{:else}
		<div class="perm-table-wrap">
			<table class="perm-table">
				<thead>
					<tr>
						<th class="col-section">Main Section</th>
						<th class="col-sub">Sub-Section</th>
						<th class="col-btn">Button</th>
						<th class="col-check">
							View
							<button class="col-toggle" onclick={() => selectAll('can_view', true)} title="Check all">✓</button>
						</th>
						<th class="col-check">
							Add
							<button class="col-toggle" onclick={() => selectAll('can_add', true)} title="Check all">✓</button>
						</th>
						<th class="col-check">
							Edit
							<button class="col-toggle" onclick={() => selectAll('can_edit', true)} title="Check all">✓</button>
						</th>
						<th class="col-check">
							Delete
							<button class="col-toggle" onclick={() => selectAll('can_delete', true)} title="Check all">✓</button>
						</th>
						<th class="col-check">Full</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredPerms as row}
						<tr>
							<td class="col-section">{row.main_section}</td>
							<td class="col-sub">{row.sub_section}</td>
							<td class="col-btn">
								<span class="btn-icon">{row.icon}</span> {row.button_name}
							</td>
							<td class="col-check">
								<button class="check-toggle" class:on={row.can_view} onclick={() => togglePerm(row, 'can_view')}>
									{row.can_view ? '✓' : '✗'}
								</button>
							</td>
							<td class="col-check">
								<button class="check-toggle" class:on={row.can_add} onclick={() => togglePerm(row, 'can_add')}>
									{row.can_add ? '✓' : '✗'}
								</button>
							</td>
							<td class="col-check">
								<button class="check-toggle" class:on={row.can_edit} onclick={() => togglePerm(row, 'can_edit')}>
									{row.can_edit ? '✓' : '✗'}
								</button>
							</td>
							<td class="col-check">
								<button class="check-toggle" class:on={row.can_delete} onclick={() => togglePerm(row, 'can_delete')}>
									{row.can_delete ? '✓' : '✗'}
								</button>
							</td>
							<td class="col-check">
								<button
									class="check-toggle full"
									class:on={row.can_view && row.can_add && row.can_edit && row.can_delete}
									onclick={() => toggleFullAccess(row)}
								>
									{row.can_view && row.can_add && row.can_edit && row.can_delete ? '✓' : '✗'}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Actions -->
		<div class="perm-actions">
			<button class="btn-reset" onclick={resetPermissions} disabled={saving}>Reset All</button>
			<button class="btn-save" onclick={savePermissions} disabled={saving || !hasChanges}>
				{saving ? 'Saving...' : 'Save Permissions'}
			</button>
		</div>
	{/if}
</div>

<style>
	.perm-window {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: var(--space-4);
		gap: var(--space-4);
	}

	/* Toolbar */
	.perm-toolbar {
		display: flex;
		gap: var(--space-4);
		align-items: flex-end;
	}
	.user-selector { flex: 1; position: relative; }
	.perm-search { width: 200px; }
	.field-label {
		display: block;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		margin-bottom: 4px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.user-search-input, .filter-input {
		width: 100%;
		padding: 8px 12px;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		background: var(--color-white);
	}
	.user-search-input:focus, .filter-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px var(--color-primary-50);
	}
	.user-dropdown-wrap { position: relative; }
	.user-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--color-white);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		max-height: 220px;
		overflow-y: auto;
		z-index: 100;
		margin-top: 4px;
	}
	.user-option {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		transition: background var(--transition-fast);
	}
	.user-option:hover { background: var(--color-primary-50); }
	.user-option.selected { background: var(--color-primary-50); }
	.uo-name { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text); }
	.uo-meta { font-size: 11px; color: var(--color-text-secondary); }

	/* Empty + notices */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: var(--space-2);
		color: var(--color-text-secondary);
	}
	.empty-icon { font-size: 3rem; }
	.sa-notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: var(--space-3);
		text-align: center;
		color: var(--color-text-secondary);
	}
	.sa-icon { font-size: 3rem; }

	/* Table */
	.perm-table-wrap {
		flex: 1;
		overflow: auto;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
	}
	.perm-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}
	.perm-table thead {
		background: var(--color-bg-alt);
		position: sticky;
		top: 0;
		z-index: 2;
	}
	.perm-table th {
		padding: 10px 12px;
		text-align: left;
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--color-text-secondary);
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}
	.perm-table td {
		padding: 8px 12px;
		border-bottom: 1px solid var(--color-border-light);
		color: var(--color-text);
	}
	.perm-table tr:hover td { background: var(--color-surface-hover); }
	.col-section { min-width: 120px; }
	.col-sub { min-width: 110px; }
	.col-btn { min-width: 120px; }
	.col-check { text-align: center !important; width: 60px; min-width: 60px; }
	.btn-icon { margin-right: 4px; }

	.col-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px; height: 18px;
		border-radius: 3px;
		font-size: 10px;
		background: var(--color-primary-50);
		color: var(--color-primary);
		border: none;
		cursor: pointer;
		margin-left: 4px;
		vertical-align: middle;
	}
	.col-toggle:hover { background: var(--color-primary); color: white; }

	/* Check toggles */
	.check-toggle {
		width: 30px; height: 30px;
		border-radius: var(--radius-sm);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 700;
		border: 1.5px solid var(--color-border);
		background: var(--color-white);
		color: var(--color-text-light);
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.check-toggle.on {
		background: var(--color-primary-50);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
	.check-toggle:hover { border-color: var(--color-primary); }
	.check-toggle.full.on {
		background: #C9A24D;
		border-color: #A87A28;
		color: white;
	}

	/* Actions */
	.perm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-light);
	}
	.btn-save {
		padding: 8px 24px;
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		background: var(--color-primary);
		color: white;
		border: none;
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.btn-save:hover:not(:disabled) { background: var(--color-primary-dark); }
	.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-reset {
		padding: 8px 24px;
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		background: #fde8e8;
		color: var(--color-danger);
		border: none;
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.btn-reset:hover:not(:disabled) { background: var(--color-danger); color: white; }
	.btn-reset:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
