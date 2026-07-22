<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog, diffChanges } from '$lib/utils/audit';

	const RESOURCE_KEY = 'settings.management.branches';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	type Branch = {
		id: string; branch_code: string; branch_name: string;
		address: string | null; state: string | null; district: string | null;
		gstin: string | null; phone: string | null; map_url: string | null;
		is_active: boolean; created_at: string;
	};

	let activeTab: 'list' | 'create' | 'edit' = $state('list');
	let loading = $state(false);

	// List
	let branches = $state<Branch[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let currentPage = $state(1);
	const pageSize = 15;

	// Create
	let createForm = $state({
		branch_code: '', branch_name: '', address: '', state: '', district: '',
		gstin: '', phone: '', map_url: '', is_active: true
	});
	let createLoading = $state(false);

	// Edit
	let editBranchId = $state('');
	let editForm = $state<any>(null);
	let editFormOriginalJson = '';
	let editLoading = $state(false);
	let selectedBranch = $state<Branch | null>(null);

	async function loadBranches() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_list_branches', {
			p_search: searchQuery,
			p_active_only: false,
			p_sort_by: 'created_at',
			p_sort_dir: 'desc',
			p_limit: pageSize,
			p_offset: (currentPage - 1) * pageSize
		});
		loading = false;
		if (error) { toasts.add('Failed to load branches: ' + error.message, 'error'); return; }
		branches = data?.data || [];
		totalCount = data?.total || 0;
	}

	async function handleCreate() {
		if (!createForm.branch_code.trim()) { toasts.add('Branch code is required', 'error'); return; }
		if (!createForm.branch_name.trim()) { toasts.add('Branch name is required', 'error'); return; }

		createLoading = true;
		const { data, error } = await supabase.rpc('rpc_create_branch', {
			p_branch_code: createForm.branch_code.trim(),
			p_branch_name: createForm.branch_name.trim(),
			p_address: createForm.address.trim() || null,
			p_state: createForm.state.trim() || null,
			p_district: createForm.district.trim() || null,
			p_gstin: createForm.gstin.trim() || null,
			p_phone: createForm.phone.trim() || null,
			p_map_url: createForm.map_url.trim() || null,
			p_is_active: createForm.is_active
		});
		createLoading = false;

		if (error) { toasts.add('Create failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Create failed', 'error'); return; }

		toasts.add('Branch created successfully!', 'success');
		writeAuditLog({ action: 'create', resourceType: 'branch', resourceId: data.branch_id || '', resourceLabel: createForm.branch_name.trim(), details: { branch_code: createForm.branch_code.trim() } });
		resetCreateForm();
		activeTab = 'list';
		await loadBranches();
	}

	function resetCreateForm() {
		createForm = {
			branch_code: '', branch_name: '', address: '', state: '', district: '',
			gstin: '', phone: '', map_url: '', is_active: true
		};
	}

	async function startEdit(br: Branch) {
		selectedBranch = br;
		editBranchId = br.id;
		editLoading = true;
		const { data, error } = await supabase.rpc('rpc_get_branch', { p_branch_id: br.id });
		editLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load branch details', 'error'); return; }
		const d = data.data;
		const formData = {
			branch_name: d.branch_name, address: d.address || '',
			state: d.state || '', district: d.district || '',
			gstin: d.gstin || '', phone: d.phone || '',
			map_url: d.map_url || '', is_active: d.is_active
		};
		editFormOriginalJson = JSON.stringify(formData);
		editForm = formData;
		activeTab = 'edit';
	}

	async function handleUpdate() {
		if (!editForm) return;
		editLoading = true;

		const { data, error } = await supabase.rpc('rpc_update_branch', {
			p_branch_id: editBranchId,
			p_branch_name: editForm.branch_name.trim() || null,
			p_address: editForm.address,
			p_state: editForm.state,
			p_district: editForm.district,
			p_gstin: editForm.gstin,
			p_phone: editForm.phone,
			p_map_url: editForm.map_url,
			p_is_active: editForm.is_active
		});
		editLoading = false;

		if (error) { toasts.add('Update failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Update failed', 'error'); return; }

		toasts.add('Branch updated successfully!', 'success');
		const originalForm = JSON.parse(editFormOriginalJson);
		const currentForm = { branch_name: editForm.branch_name, address: editForm.address, state: editForm.state, district: editForm.district, gstin: editForm.gstin, phone: editForm.phone, map_url: editForm.map_url, is_active: editForm.is_active };
		const changes = diffChanges(originalForm, currentForm, ['branch_name','address','state','district','gstin','phone','map_url','is_active']);
		writeAuditLog({ action: 'update', resourceType: 'branch', resourceId: editBranchId, resourceLabel: currentForm.branch_name, changes });
		activeTab = 'list';
		editForm = null;
		editFormOriginalJson = '';
		await loadBranches();
	}

	$effect(() => { loadBranches(); });

	const totalPages = $derived(Math.ceil(totalCount / pageSize));
	function doSearch() { currentPage = 1; loadBranches(); }
</script>

<div class="branches-window">
	<div class="toolbar">
		<button class="toolbar-btn" class:active={activeTab === 'list'} onclick={() => { activeTab = 'list'; loadBranches(); }}>📋 Branch List</button>
		{#if permAdd}
			<button class="toolbar-btn" class:active={activeTab === 'create'} onclick={() => { activeTab = 'create'; resetCreateForm(); }}>➕ Create Branch</button>
		{/if}
		{#if permEdit}
			<button class="toolbar-btn" class:active={activeTab === 'edit'} disabled={activeTab !== 'edit'}>✏️ Edit Branch</button>
		{/if}
	</div>

	<div class="tab-content">
		{#if activeTab === 'list'}
			<div class="list-controls">
				<div class="search-box">
					<input type="text" placeholder="Search name, code, location..." bind:value={searchQuery} onkeydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
					<button class="btn-sm" onclick={doSearch}>Search</button>
				</div>
			</div>

			{#if loading}
				<div class="center-state">Loading...</div>
			{:else if branches.length === 0}
				<div class="center-state">No branches found.</div>
			{:else}
				<div class="table-wrap">
					<table class="data-table">
						<thead><tr>
							<th>Code</th><th>Name</th><th>Address</th><th>District</th>
							<th>State</th><th>Phone</th><th>Status</th><th>Actions</th>
						</tr></thead>
						<tbody>
							{#each branches as br}
								<tr>
									<td class="mono">{br.branch_code}</td>
									<td class="bold">{br.branch_name}</td>
									<td>{br.address || '—'}</td>
									<td>{br.district || '—'}</td>
									<td>{br.state || '—'}</td>
									<td>{br.phone || '—'}</td>
									<td><span class="status-badge" class:st-active={br.is_active} class:st-inactive={!br.is_active}>{br.is_active ? 'Active' : 'Inactive'}</span></td>
									<td>{#if permEdit}<button class="btn-sm" onclick={() => startEdit(br)}>Edit</button>{/if}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="pagination">
					<span class="pg-info">Showing {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize, totalCount)} of {totalCount}</span>
					<div class="pg-btns">
						<button class="btn-sm" disabled={currentPage <= 1} onclick={() => { currentPage--; loadBranches(); }}>← Prev</button>
						<span class="pg-num">Page {currentPage}/{totalPages}</span>
						<button class="btn-sm" disabled={currentPage >= totalPages} onclick={() => { currentPage++; loadBranches(); }}>Next →</button>
					</div>
				</div>
			{/if}

		{:else if activeTab === 'create'}
			<form class="branch-form" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
				<h3 class="sec-title">Branch Information</h3>
				<div class="form-grid">
					<div class="field"><label for="c-code">Branch Code *</label><input id="c-code" type="text" bind:value={createForm.branch_code} placeholder="e.g. BR-002" required /></div>
					<div class="field"><label for="c-name">Branch Name *</label><input id="c-name" type="text" bind:value={createForm.branch_name} required /></div>
					<div class="field full-width"><label for="c-addr">Address</label><input id="c-addr" type="text" bind:value={createForm.address} /></div>
					<div class="field"><label for="c-state">State</label><input id="c-state" type="text" bind:value={createForm.state} /></div>
					<div class="field"><label for="c-dist">District</label><input id="c-dist" type="text" bind:value={createForm.district} /></div>
					<div class="field"><label for="c-phone">Phone</label><input id="c-phone" type="text" bind:value={createForm.phone} /></div>
					<div class="field"><label for="c-gstin">GSTIN</label><input id="c-gstin" type="text" bind:value={createForm.gstin} /></div>
					<div class="field full-width"><label for="c-map">Google Maps URL</label><input id="c-map" type="url" bind:value={createForm.map_url} /></div>
					<div class="field"><label for="c-active">Status</label><select id="c-active" bind:value={createForm.is_active}><option value={true}>Active</option><option value={false}>Inactive</option></select></div>
				</div>
				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={() => { activeTab = 'list'; resetCreateForm(); }}>Cancel</button>
					<button type="submit" class="btn-save" disabled={createLoading}>{createLoading ? 'Creating...' : 'Create Branch'}</button>
				</div>
			</form>

		{:else if activeTab === 'edit' && editForm}
			<div class="edit-header"><span class="edit-code">{selectedBranch?.branch_code}</span><span class="edit-name">{selectedBranch?.branch_name}</span></div>
			<form class="branch-form" onsubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
				<h3 class="sec-title">Branch Information</h3>
				<div class="form-grid">
					<div class="field"><label for="e-name">Branch Name</label><input id="e-name" type="text" bind:value={editForm.branch_name} /></div>
					<div class="field full-width"><label for="e-addr">Address</label><input id="e-addr" type="text" bind:value={editForm.address} /></div>
					<div class="field"><label for="e-state">State</label><input id="e-state" type="text" bind:value={editForm.state} /></div>
					<div class="field"><label for="e-dist">District</label><input id="e-dist" type="text" bind:value={editForm.district} /></div>
					<div class="field"><label for="e-phone">Phone</label><input id="e-phone" type="text" bind:value={editForm.phone} /></div>
					<div class="field"><label for="e-gstin">GSTIN</label><input id="e-gstin" type="text" bind:value={editForm.gstin} /></div>
					<div class="field full-width"><label for="e-map">Google Maps URL</label><input id="e-map" type="url" bind:value={editForm.map_url} /></div>
					<div class="field"><label for="e-active">Status</label><select id="e-active" bind:value={editForm.is_active}><option value={true}>Active</option><option value={false}>Inactive</option></select></div>
				</div>
				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={() => { activeTab = 'list'; editForm = null; }}>Cancel</button>
					<button type="submit" class="btn-save" disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</button>
				</div>
			</form>

		{:else if activeTab === 'edit' && !editForm}
			<div class="center-state">Select a branch from the list to edit.</div>
		{/if}
	</div>
</div>

<style>
	.branches-window { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
	.toolbar { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border); margin-bottom: 12px; flex-shrink: 0; }
	.toolbar-btn { padding: 8px 16px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-white); color: var(--color-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
	.toolbar-btn:hover { background: var(--color-bg); }
	.toolbar-btn.active { background: #0E5A3C; color: white; border-color: #0E5A3C; }
	.toolbar-btn:disabled { opacity: 0.5; cursor: default; }
	.tab-content { flex: 1; overflow-y: auto; }

	.list-controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
	.search-box { display: flex; gap: 4px; flex: 1; min-width: 200px; }
	.search-box input { flex: 1; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; outline: none; }
	.search-box input:focus { border-color: #0E5A3C; }

	.table-wrap { overflow-x: auto; }
	.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.data-table th { text-align: left; padding: 8px 10px; background: var(--color-bg); font-weight: 600; color: var(--color-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid var(--color-border); white-space: nowrap; }
	.data-table td { padding: 8px 10px; border-bottom: 1px solid var(--color-border); }
	.data-table tbody tr:hover { background: var(--color-bg); }
	.mono { font-family: monospace; font-size: 12px; }
	.bold { font-weight: 600; }
	.status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
	.st-active { background: #e6f0eb; color: #0E5A3C; }
	.st-inactive { background: #fef2f2; color: #dc2626; }

	.pagination { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--color-border); margin-top: 8px; }
	.pg-info { font-size: 12px; color: var(--color-text-secondary); }
	.pg-btns { display: flex; align-items: center; gap: 8px; }
	.pg-num { font-size: 12px; color: var(--color-text-secondary); }

	.btn-sm { padding: 5px 12px; border: 1px solid var(--color-border); border-radius: 5px; background: white; font-size: 12px; cursor: pointer; transition: background 0.12s; }
	.btn-sm:hover:not(:disabled) { background: var(--color-bg); }
	.btn-sm:disabled { opacity: 0.5; cursor: default; }

	.branch-form { padding-bottom: 24px; }
	.sec-title { font-size: 14px; font-weight: 600; color: #0E5A3C; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border); }
	.sec-title:first-child { margin-top: 0; }
	.form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
	.field { display: flex; flex-direction: column; gap: 4px; }
	.field.full-width { grid-column: 1 / -1; }
	.field label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
	.field input, .field select { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; outline: none; background: white; }
	.field input:focus, .field select:focus { border-color: #0E5A3C; }
	.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--color-border); }
	.btn-cancel { padding: 8px 20px; border: 1px solid var(--color-border); border-radius: 6px; background: white; font-size: 13px; cursor: pointer; }
	.btn-cancel:hover { background: var(--color-bg); }
	.btn-save { padding: 8px 24px; border: none; border-radius: 6px; background: #0E5A3C; color: white; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-save:hover:not(:disabled) { background: #0A3F2C; }
	.btn-save:disabled { opacity: 0.6; cursor: default; }
	.edit-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
	.edit-code { background: var(--color-bg); padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: 600; color: #0E5A3C; }
	.edit-name { font-size: 15px; font-weight: 600; }
	.center-state { display: flex; align-items: center; justify-content: center; padding: 48px; color: var(--color-text-secondary); font-size: 14px; }
</style>
