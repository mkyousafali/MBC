<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog, diffChanges } from '$lib/utils/audit';

	const RESOURCE_KEY = 'inventory.manage.suppliers';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	type Supplier = {
		id: string; supplier_code: string; supplier_name: string;
		contact_person: string | null; phone: string | null; email: string | null;
		gstin: string | null; address: string | null; state: string | null;
		district: string | null; payment_terms: string | null;
		credit_period_days: number | null; payment_mode: string | null;
		is_active: boolean; created_at: string;
	};

	let activeView: 'list' | 'create' | 'edit' | 'detail' = $state('list');
	let loading = $state(false);
	let suppliers = $state<Supplier[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let currentPage = $state(1);
	const pageSize = 20;

	// Create form
	let createForm = $state({
		supplier_name: '', contact_person: '', phone: '', email: '',
		gstin: '', address: '', state: '', district: '',
		payment_terms: 'immediate', credit_period_days: 30,
		payment_mode: 'cash', opening_balance: 0
	});
	let createLoading = $state(false);

	// Edit state
	let editingSupplierId = $state('');
	let editingSupplierCode = $state('');
	let editForm: any = $state(null);
	let editFormOriginalJson = '';
	let editLoading = $state(false);
	let selectedSupplier: Supplier | null = $state(null);

	async function loadSuppliers(append = false) {
		if (!append) loading = true;
		const { data, error } = await supabase.rpc('rpc_list_suppliers', {
			p_search: searchQuery || null,
			p_active_only: false,
			p_limit: pageSize,
			p_offset: append ? suppliers.length : 0
		});
		loading = false;
		if (error) { toasts.add('Failed to load suppliers', 'error'); return; }
		if (append) {
			suppliers = [...suppliers, ...(data?.data || [])];
		} else {
			suppliers = data?.data || [];
		}
		totalCount = data?.total || 0;
	}

	function doSearch() { loadSuppliers(); }

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => loadSuppliers(), 400);
	}

	function viewDetail(sup: Supplier) {
		selectedSupplier = sup;
		activeView = 'detail';
	}

	// Create
	function openCreate() {
		resetCreateForm();
		activeView = 'create';
	}

	function resetCreateForm() {
		createForm = {
			supplier_name: '', contact_person: '', phone: '', email: '',
			gstin: '', address: '', state: '', district: '',
			payment_terms: 'immediate', credit_period_days: 30,
			payment_mode: 'cash', opening_balance: 0
		};
	}

	async function handleCreate() {
		if (!createForm.supplier_name.trim()) { toasts.add('Supplier name is required', 'error'); return; }
		if (!createForm.phone.trim()) { toasts.add('Phone number is required', 'error'); return; }
		if (createForm.payment_terms === 'credit' && (!createForm.credit_period_days || createForm.credit_period_days < 1)) {
			toasts.add('Credit period is required for credit terms', 'error'); return;
		}

		createLoading = true;
		const { data, error } = await supabase.rpc('rpc_create_supplier', {
			p_supplier_name: createForm.supplier_name.trim(),
			p_contact_person: createForm.contact_person.trim() || null,
			p_phone: createForm.phone.trim(),
			p_email: createForm.email.trim() || null,
			p_gstin: createForm.gstin.trim() || null,
			p_address: createForm.address.trim() || null,
			p_state: createForm.state.trim() || null,
			p_district: createForm.district.trim() || null,
			p_payment_terms: createForm.payment_terms || 'immediate',
			p_credit_period_days: createForm.payment_terms === 'credit' ? (createForm.credit_period_days || 30) : null,
			p_payment_mode: createForm.payment_mode || 'cash',
			p_opening_balance: createForm.opening_balance || 0
		});
		createLoading = false;

		if (error) { toasts.add('Create failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Create failed', 'error'); return; }

		toasts.add('Supplier created! Code: ' + data.supplier_code, 'success');
		writeAuditLog({ action: 'create', resourceType: 'supplier', resourceId: data.supplier_id || '', resourceLabel: createForm.supplier_name.trim(), details: { supplier_code: data.supplier_code } });
		activeView = 'list';
		loadSuppliers();
	}

	// Edit
	function startEdit(sup: Supplier) {
		editingSupplierId = sup.id;
		editingSupplierCode = sup.supplier_code;
		editForm = {
			supplier_name: sup.supplier_name,
			contact_person: sup.contact_person || '',
			phone: sup.phone || '',
			email: sup.email || '',
			gstin: sup.gstin || '',
			address: sup.address || '',
			state: sup.state || '',
			district: sup.district || '',
			payment_terms: sup.payment_terms || 'immediate',
			credit_period_days: sup.credit_period_days || 30,
			payment_mode: sup.payment_mode || 'cash',
			is_active: sup.is_active
		};
		editFormOriginalJson = JSON.stringify({
			supplier_name: editForm.supplier_name, contact_person: editForm.contact_person,
			phone: editForm.phone, email: editForm.email, gstin: editForm.gstin,
			address: editForm.address, state: editForm.state, district: editForm.district,
			payment_terms: editForm.payment_terms, credit_period_days: editForm.credit_period_days,
			payment_mode: editForm.payment_mode, is_active: editForm.is_active
		});
		activeView = 'edit';
	}

	async function handleEdit() {
		if (!editForm) return;
		if (!editForm.supplier_name.trim()) { toasts.add('Supplier name is required', 'error'); return; }

		editLoading = true;
		const { data, error } = await supabase.rpc('rpc_update_supplier', {
			p_supplier_id: editingSupplierId,
			p_supplier_name: editForm.supplier_name.trim(),
			p_contact_person: editForm.contact_person.trim() || null,
			p_phone: editForm.phone.trim() || null,
			p_email: editForm.email.trim() || null,
			p_gstin: editForm.gstin.trim() || null,
			p_address: editForm.address.trim() || null,
			p_state: editForm.state.trim() || null,
			p_district: editForm.district.trim() || null,
			p_payment_terms: editForm.payment_terms || 'immediate',
			p_credit_period_days: editForm.payment_terms === 'credit' ? (editForm.credit_period_days || 30) : null,
			p_payment_mode: editForm.payment_mode || 'cash',
			p_is_active: editForm.is_active
		});
		editLoading = false;

		if (error) { toasts.add('Update failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Update failed', 'error'); return; }

		toasts.add('Supplier updated!', 'success');
		const editOriginal = editFormOriginalJson ? JSON.parse(editFormOriginalJson) : {};
		const editCurrent = {
			supplier_name: editForm.supplier_name, contact_person: editForm.contact_person,
			phone: editForm.phone, email: editForm.email, gstin: editForm.gstin,
			address: editForm.address, state: editForm.state, district: editForm.district,
			payment_terms: editForm.payment_terms, credit_period_days: editForm.credit_period_days,
			payment_mode: editForm.payment_mode, is_active: editForm.is_active
		};
		const changes = diffChanges(editOriginal, editCurrent);
		writeAuditLog({ action: 'update', resourceType: 'supplier', resourceId: editingSupplierId, resourceLabel: editForm.supplier_name.trim(), changes });

		if (editOriginal.is_active !== editCurrent.is_active) {
			writeAuditLog({ action: 'status_change', resourceType: 'supplier', resourceId: editingSupplierId, resourceLabel: editForm.supplier_name.trim(), changes: [{ field: 'is_active', from: editOriginal.is_active, to: editCurrent.is_active }] });
		}

		activeView = 'list';
		loadSuppliers();
	}

	function goBack() {
		if (activeView === 'detail' || activeView === 'create' || activeView === 'edit') {
			activeView = 'list';
		}
	}

	onMount(() => { loadSuppliers(); });
</script>

<div class="mobile-suppliers">
	{#if activeView === 'list'}
		<!-- LIST VIEW -->
		<div class="page-title">
			<h2>🚚 Suppliers</h2>
			{#if permAdd}
				<button class="btn-add" onclick={openCreate}>+ New</button>
			{/if}
		</div>

		<div class="search-bar">
			<input type="text" placeholder="Search suppliers..." bind:value={searchQuery} oninput={onSearchInput} onkeydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
			<button class="btn-search" onclick={doSearch}>🔍</button>
		</div>

		{#if loading}
			<div class="loading-state">Loading...</div>
		{:else if suppliers.length === 0}
			<div class="empty-state">No suppliers found.</div>
		{:else}
			<div class="card-list">
				{#each suppliers as sup}
					<div class="item-card" onclick={() => viewDetail(sup)}>
						<div class="card-top">
							<span class="card-code">{sup.supplier_code}</span>
							<span class="status-dot" class:active={sup.is_active} class:inactive={!sup.is_active}>{sup.is_active ? 'Active' : 'Inactive'}</span>
						</div>
						<div class="card-name">{sup.supplier_name}</div>
						<div class="card-meta">
							{#if sup.phone}<span>📱 {sup.phone}</span>{/if}
							{#if sup.contact_person}<span>👤 {sup.contact_person}</span>{/if}
							{#if sup.payment_terms}<span>💳 {sup.payment_terms === 'credit' ? `Credit (${sup.credit_period_days}d)` : 'Immediate'}</span>{/if}
						</div>
						<div class="card-bottom">
							{#if sup.state}<span class="card-location">📍 {sup.district ? sup.district + ', ' : ''}{sup.state}</span>{/if}
							{#if permEdit}
								<button class="btn-action" onclick={(e) => { e.stopPropagation(); startEdit(sup); }}>✏️ Edit</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if suppliers.length < totalCount}
				<button class="btn-load-more" onclick={() => loadSuppliers(true)}>Load More ({suppliers.length}/{totalCount})</button>
			{/if}
		{/if}

	{:else if activeView === 'detail'}
		<!-- DETAIL VIEW -->
		<div class="page-title">
			<button class="btn-back" onclick={goBack}>←</button>
			<h2>{selectedSupplier?.supplier_name || 'Supplier'}</h2>
		</div>

		{#if selectedSupplier}
			<div class="detail-card">
				<div class="detail-row"><span class="label">Code</span><span>{selectedSupplier.supplier_code}</span></div>
				<div class="detail-row"><span class="label">Name</span><span>{selectedSupplier.supplier_name}</span></div>
				<div class="detail-row"><span class="label">Contact</span><span>{selectedSupplier.contact_person || '—'}</span></div>
				<div class="detail-row"><span class="label">Phone</span><span>{selectedSupplier.phone || '—'}</span></div>
				<div class="detail-row"><span class="label">Email</span><span>{selectedSupplier.email || '—'}</span></div>
				<div class="detail-row"><span class="label">GSTIN</span><span>{selectedSupplier.gstin || '—'}</span></div>
				<div class="detail-row"><span class="label">Address</span><span>{selectedSupplier.address || '—'}</span></div>
				<div class="detail-row"><span class="label">State</span><span>{selectedSupplier.state || '—'}</span></div>
				<div class="detail-row"><span class="label">District</span><span>{selectedSupplier.district || '—'}</span></div>
				<div class="detail-row"><span class="label">Payment</span><span>{selectedSupplier.payment_terms === 'credit' ? `Credit (${selectedSupplier.credit_period_days} days)` : 'Immediate'}</span></div>
				<div class="detail-row"><span class="label">Mode</span><span style="text-transform:capitalize">{selectedSupplier.payment_mode || '—'}</span></div>
				<div class="detail-row"><span class="label">Status</span><span class="status-dot" class:active={selectedSupplier.is_active} class:inactive={!selectedSupplier.is_active}>{selectedSupplier.is_active ? 'Active' : 'Inactive'}</span></div>
			</div>
			{#if permEdit}
				<button class="btn-primary full-width" onclick={() => startEdit(selectedSupplier!)}>✏️ Edit Supplier</button>
			{/if}
		{/if}

	{:else if activeView === 'create'}
		<!-- CREATE VIEW -->
		<div class="page-title">
			<button class="btn-back" onclick={goBack}>←</button>
			<h2>New Supplier</h2>
		</div>

		<div class="form-container">
			<div class="form-section">
				<h3>Basic Info</h3>
				<label class="field">
					<span>Supplier Name *</span>
					<input type="text" bind:value={createForm.supplier_name} placeholder="Enter supplier name" />
				</label>
				<label class="field">
					<span>Contact Person</span>
					<input type="text" bind:value={createForm.contact_person} placeholder="Contact person name" />
				</label>
				<div class="field-row">
					<label class="field half">
						<span>Phone *</span>
						<input type="tel" bind:value={createForm.phone} placeholder="Phone number" />
					</label>
					<label class="field half">
						<span>Email</span>
						<input type="email" bind:value={createForm.email} placeholder="Email" />
					</label>
				</div>
				<label class="field">
					<span>GSTIN</span>
					<input type="text" bind:value={createForm.gstin} placeholder="GST Number" />
				</label>
			</div>

			<div class="form-section">
				<h3>Address</h3>
				<label class="field">
					<span>Address</span>
					<textarea bind:value={createForm.address} rows="2" placeholder="Full address"></textarea>
				</label>
				<div class="field-row">
					<label class="field half">
						<span>State</span>
						<input type="text" bind:value={createForm.state} placeholder="State" />
					</label>
					<label class="field half">
						<span>District</span>
						<input type="text" bind:value={createForm.district} placeholder="District" />
					</label>
				</div>
			</div>

			<div class="form-section">
				<h3>Payment</h3>
				<label class="field">
					<span>Payment Terms</span>
					<select bind:value={createForm.payment_terms}>
						<option value="immediate">Immediate</option>
						<option value="credit">Credit</option>
					</select>
				</label>
				{#if createForm.payment_terms === 'credit'}
					<label class="field">
						<span>Credit Period (days)</span>
						<input type="number" bind:value={createForm.credit_period_days} min="1" />
					</label>
				{/if}
				<label class="field">
					<span>Payment Mode</span>
					<select bind:value={createForm.payment_mode}>
						<option value="cash">Cash</option>
						<option value="bank">Bank Transfer</option>
						<option value="upi">UPI</option>
						<option value="cheque">Cheque</option>
					</select>
				</label>
				<label class="field">
					<span>Opening Balance (₹)</span>
					<input type="number" bind:value={createForm.opening_balance} min="0" step="0.01" />
				</label>
			</div>

			<button class="btn-primary full-width" onclick={handleCreate} disabled={createLoading}>
				{createLoading ? 'Creating...' : '✅ Create Supplier'}
			</button>
		</div>

	{:else if activeView === 'edit'}
		<!-- EDIT VIEW -->
		<div class="page-title">
			<button class="btn-back" onclick={goBack}>←</button>
			<h2>✏️ {editingSupplierCode}</h2>
		</div>

		{#if editForm}
			<div class="form-container">
				<div class="form-section">
					<h3>Basic Info</h3>
					<label class="field">
						<span>Supplier Name *</span>
						<input type="text" bind:value={editForm.supplier_name} />
					</label>
					<label class="field">
						<span>Contact Person</span>
						<input type="text" bind:value={editForm.contact_person} />
					</label>
					<div class="field-row">
						<label class="field half">
							<span>Phone</span>
							<input type="tel" bind:value={editForm.phone} />
						</label>
						<label class="field half">
							<span>Email</span>
							<input type="email" bind:value={editForm.email} />
						</label>
					</div>
					<label class="field">
						<span>GSTIN</span>
						<input type="text" bind:value={editForm.gstin} />
					</label>
				</div>

				<div class="form-section">
					<h3>Address</h3>
					<label class="field">
						<span>Address</span>
						<textarea bind:value={editForm.address} rows="2"></textarea>
					</label>
					<div class="field-row">
						<label class="field half">
							<span>State</span>
							<input type="text" bind:value={editForm.state} />
						</label>
						<label class="field half">
							<span>District</span>
							<input type="text" bind:value={editForm.district} />
						</label>
					</div>
				</div>

				<div class="form-section">
					<h3>Payment</h3>
					<label class="field">
						<span>Payment Terms</span>
						<select bind:value={editForm.payment_terms}>
							<option value="immediate">Immediate</option>
							<option value="credit">Credit</option>
						</select>
					</label>
					{#if editForm.payment_terms === 'credit'}
						<label class="field">
							<span>Credit Period (days)</span>
							<input type="number" bind:value={editForm.credit_period_days} min="1" />
						</label>
					{/if}
					<label class="field">
						<span>Payment Mode</span>
						<select bind:value={editForm.payment_mode}>
							<option value="cash">Cash</option>
							<option value="bank">Bank Transfer</option>
							<option value="upi">UPI</option>
							<option value="cheque">Cheque</option>
						</select>
					</label>
				</div>

				<div class="form-section">
					<h3>Status</h3>
					<label class="toggle-field">
						<span>Active</span>
						<input type="checkbox" bind:checked={editForm.is_active} />
					</label>
				</div>

				<button class="btn-primary full-width" onclick={handleEdit} disabled={editLoading}>
					{editLoading ? 'Updating...' : '✅ Update Supplier'}
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.mobile-suppliers { padding: 16px; padding-bottom: 80px; }

	.page-title { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
	.page-title h2 { font-size: 18px; font-weight: 700; color: #2B2B2B; margin: 0; }

	.btn-back { background: none; border: none; font-size: 15px; color: #0E5A3C; font-weight: 600; cursor: pointer; padding: 4px 0; }
	.btn-add { margin-left: auto; background: #0E5A3C; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-add:active { background: #0A3F2C; }

	.search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
	.search-bar input { flex: 1; padding: 10px 14px; border: 1px solid #E8E8E8; border-radius: 10px; font-size: 14px; background: white; }
	.search-bar input:focus { outline: none; border-color: #0E5A3C; }
	.btn-search { background: #0E5A3C; color: white; border: none; padding: 10px 14px; border-radius: 10px; font-size: 16px; cursor: pointer; }

	.loading-state, .empty-state { text-align: center; padding: 40px 20px; color: #888; font-size: 14px; }

	.card-list { display: flex; flex-direction: column; gap: 10px; }

	.item-card {
		background: white; border-radius: 12px; padding: 14px 16px;
		box-shadow: 0 1px 4px rgba(0,0,0,0.07); cursor: pointer; transition: background 0.15s;
	}
	.item-card:active { background: #f8f8f5; }

	.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
	.card-code { font-size: 11px; color: #999; font-weight: 600; font-family: monospace; }
	.card-name { font-size: 15px; font-weight: 700; color: #2B2B2B; margin-bottom: 6px; }
	.card-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #777; margin-bottom: 8px; }
	.card-bottom { display: flex; justify-content: space-between; align-items: center; }
	.card-location { font-size: 12px; color: #999; }

	.status-dot { font-size: 12px; font-weight: 600; }
	.status-dot.active { color: #27ae60; }
	.status-dot.inactive { color: #e74c3c; }

	.btn-action { background: none; border: 1px solid #E8E8E8; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; color: #555; }
	.btn-action:active { background: #f0f0f0; }

	.btn-load-more { width: 100%; padding: 12px; margin-top: 12px; background: white; border: 1px solid #E8E8E8; border-radius: 10px; font-size: 13px; color: #0E5A3C; font-weight: 600; cursor: pointer; }

	/* Detail */
	.detail-card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; }
	.detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
	.detail-row:last-child { border-bottom: none; }
	.detail-row .label { color: #888; font-weight: 500; }

	/* Form */
	.form-container { display: flex; flex-direction: column; gap: 16px; }
	.form-section { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
	.form-section h3 { font-size: 14px; font-weight: 700; color: #0E5A3C; margin: 0 0 12px; }

	.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
	.field span { font-size: 12px; font-weight: 600; color: #555; }
	.field input, .field select, .field textarea { padding: 10px 12px; border: 1px solid #E8E8E8; border-radius: 8px; font-size: 14px; background: #fafafa; }
	.field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: #0E5A3C; background: white; }

	.field-row { display: flex; gap: 8px; }
	.field.half { flex: 1; min-width: 0; }
	.field input, .field select, .field textarea { width: 100%; box-sizing: border-box; }

	.toggle-field { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
	.toggle-field span { font-size: 14px; font-weight: 600; color: #555; }
	.toggle-field input[type="checkbox"] { width: 20px; height: 20px; accent-color: #0E5A3C; }

	.btn-primary { background: #0E5A3C; color: white; border: none; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
	.btn-primary:active { background: #0A3F2C; }
	.btn-primary:disabled { opacity: 0.6; cursor: default; }
	.full-width { width: 100%; }
</style>
