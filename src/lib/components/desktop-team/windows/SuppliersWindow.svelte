<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog, diffChanges } from '$lib/utils/audit';

	const RESOURCE_KEY = 'inventory.manage.suppliers';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	let permDelete = $state(false);
	let currentUserId = $state('');
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; currentUserId = u?.user_id || ''; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
		permDelete = isSA || (r?.can_delete ?? false);
	});

	type Supplier = {
		id: string;
		supplier_code: string;
		supplier_name: string;
		contact_person: string | null;
		phone: string | null;
		email: string | null;
		gstin: string | null;
		address: string | null;
		state: string | null;
		district: string | null;
		payment_terms: string | null;
		credit_period_days: number | null;
		payment_mode: string | null;
		is_active: boolean;
		ledger_id: string | null;
		ledger_code: string | null;
		created_at: string;
	};

	let activeTab: 'create' | 'manage' = $state('create');

	// Create form
	let createForm = $state({
		supplier_name: '',
		contact_person: '',
		phone: '',
		email: '',
		gstin: '',
		address: '',
		state: '',
		district: '',
		payment_terms: 'immediate',
		credit_period_days: 30,
		payment_mode: 'cash',
		opening_balance: 0
	});
	let createLoading = $state(false);

	// Manage
	let loading = $state(false);
	let suppliers = $state<Supplier[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let currentPage = $state(1);
	const pageSize = 20;

	// Edit
	let editingSupplier = $state<Supplier | null>(null);
	let editForm = $state<any>(null);
	let editFormOriginalJson = '';
	let editLoading = $state(false);

	async function handleCreate() {
		if (!createForm.supplier_name.trim()) { toasts.add('Supplier name is required', 'error'); return; }
		if (!createForm.phone.trim()) { toasts.add('Phone number is required', 'error'); return; }

		createLoading = true;
		if (createForm.payment_terms === 'credit' && (!createForm.credit_period_days || createForm.credit_period_days < 1)) {
			toasts.add('Credit period is required for credit payment terms', 'error'); return;
		}

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
		resetCreateForm();
	}

	function resetCreateForm() {
		createForm = { supplier_name: '', contact_person: '', phone: '', email: '', gstin: '', address: '', state: '', district: '', payment_terms: 'immediate', credit_period_days: 30, payment_mode: 'cash', opening_balance: 0 };
	}

	async function loadSuppliers() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_list_suppliers', {
			p_search: searchQuery || null,
			p_active_only: false,
			p_limit: pageSize,
			p_offset: (currentPage - 1) * pageSize
		});
		loading = false;
		if (error) { toasts.add('Failed to load suppliers: ' + error.message, 'error'); return; }
		suppliers = data?.data || [];
		totalCount = data?.total || 0;
	}

	function doSearch() { currentPage = 1; loadSuppliers(); }

	function startEdit(sup: Supplier) {
		editingSupplier = sup;
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
		editFormOriginalJson = JSON.stringify(editForm);
	}

	function cancelEdit() {
		editingSupplier = null;
		editForm = null;
		editFormOriginalJson = '';
	}

	async function handleEdit() {
		if (!editingSupplier || !editForm) return;
		if (JSON.stringify(editForm) === editFormOriginalJson) { toasts.add('No changes', 'info'); return; }
		if (!editForm.supplier_name.trim()) { toasts.add('Supplier name is required', 'error'); return; }

		editLoading = true;
		const { data, error } = await supabase.rpc('rpc_update_supplier', {
			p_supplier_id: editingSupplier.id,
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
		const supOriginal = editFormOriginalJson ? JSON.parse(editFormOriginalJson) : {};
		const supCurrent = { supplier_name: editForm.supplier_name, contact_person: editForm.contact_person, phone: editForm.phone, email: editForm.email, gstin: editForm.gstin, address: editForm.address, state: editForm.state, district: editForm.district, payment_terms: editForm.payment_terms, credit_period_days: editForm.credit_period_days, payment_mode: editForm.payment_mode, is_active: editForm.is_active };
		const supChanges = diffChanges(supOriginal, supCurrent);
		writeAuditLog({ action: 'update', resourceType: 'supplier', resourceId: editingSupplier.id, resourceLabel: editForm.supplier_name.trim(), changes: supChanges });
		cancelEdit();
		await loadSuppliers();
	}

	function tabSwitch(tab: 'create' | 'manage') {
		activeTab = tab;
		if (tab === 'manage' && suppliers.length === 0) loadSuppliers();
	}
</script>

<div class="suppliers-window">
	<!-- Tab Bar -->
	<div class="tab-bar">
		{#if permAdd}<button class="tab" class:active={activeTab === 'create'} onclick={() => tabSwitch('create')}>
			Create Supplier
		</button>{/if}
		<button class="tab" class:active={activeTab === 'manage'} onclick={() => tabSwitch('manage')}>
			Manage Suppliers
		</button>
	</div>

	<!-- Tab Content -->
	<div class="tab-content">
		{#if activeTab === 'create'}
			<!-- CREATE SUPPLIER FORM -->
			<div class="form-container">
				<div class="form-card">
					<h3>New Supplier</h3>
					<div class="form-grid">
						<div class="field">
							<label>Supplier Name <span class="req">*</span></label>
							<input type="text" bind:value={createForm.supplier_name} placeholder="Enter supplier name" />
						</div>
						<div class="field">
							<label>Contact Person</label>
							<input type="text" bind:value={createForm.contact_person} placeholder="Contact person name" />
						</div>
						<div class="field">
							<label>Phone <span class="req">*</span></label>
							<input type="text" bind:value={createForm.phone} placeholder="Phone number" />
						</div>
						<div class="field">
							<label>Email</label>
							<input type="email" bind:value={createForm.email} placeholder="Email address" />
						</div>
						<div class="field">
							<label>GSTIN</label>
							<input type="text" bind:value={createForm.gstin} placeholder="GST number" />
						</div>
						<div class="field">
							<label>Payment Terms</label>
							<select bind:value={createForm.payment_terms}>
								<option value="immediate">Immediate</option>
								<option value="credit">Credit</option>
							</select>
						</div>
						{#if createForm.payment_terms === 'credit'}
							<div class="field">
								<label>Credit Period (Days) <span class="req">*</span></label>
								<input type="number" bind:value={createForm.credit_period_days} placeholder="30" min="1" max="365" />
							</div>
						{/if}
						<div class="field">
							<label>Payment Mode</label>
							<select bind:value={createForm.payment_mode}>
								<option value="cash">Cash</option>
								<option value="bank">Bank</option>
							</select>
						</div>
						<div class="field">
							<label>Opening Balance (₹)</label>
							<input type="number" bind:value={createForm.opening_balance} placeholder="0" min="0" step="0.01" />
						</div>
						<div class="field full-width">
							<label>Address</label>
							<textarea bind:value={createForm.address} placeholder="Full address" rows="2"></textarea>
						</div>
						<div class="field">
							<label>State</label>
							<input type="text" bind:value={createForm.state} placeholder="State" />
						</div>
						<div class="field">
							<label>District</label>
							<input type="text" bind:value={createForm.district} placeholder="District" />
						</div>
					</div>
					<div class="form-actions">
						<button class="btn-secondary" onclick={resetCreateForm}>Clear</button>
						<button class="btn-primary" onclick={handleCreate} disabled={createLoading}>
							{createLoading ? 'Creating...' : 'Create Supplier'}
						</button>
					</div>
				</div>
			</div>

		{:else}
			<!-- MANAGE SUPPLIERS -->
			<div class="manage-container">
				{#if editingSupplier && editForm}
					<!-- Edit Form -->
					<div class="form-card">
						<div class="edit-header">
							<h3>Edit: {editingSupplier.supplier_code}</h3>
							<button class="btn-ghost" onclick={cancelEdit}>✕ Cancel</button>
						</div>
						<div class="form-grid">
							<div class="field">
								<label>Supplier Name <span class="req">*</span></label>
								<input type="text" bind:value={editForm.supplier_name} />
							</div>
							<div class="field">
								<label>Contact Person</label>
								<input type="text" bind:value={editForm.contact_person} />
							</div>
							<div class="field">
								<label>Phone</label>
								<input type="text" bind:value={editForm.phone} />
							</div>
							<div class="field">
								<label>Email</label>
								<input type="email" bind:value={editForm.email} />
							</div>
							<div class="field">
								<label>GSTIN</label>
								<input type="text" bind:value={editForm.gstin} />
							</div>
							<div class="field">
								<label>Payment Terms</label>
								<select bind:value={editForm.payment_terms}>
									<option value="immediate">Immediate</option>
									<option value="credit">Credit</option>
								</select>
							</div>
							{#if editForm.payment_terms === 'credit'}
								<div class="field">
									<label>Credit Period (Days) <span class="req">*</span></label>
									<input type="number" bind:value={editForm.credit_period_days} placeholder="30" min="1" max="365" />
								</div>
							{/if}
							<div class="field">
								<label>Payment Mode</label>
								<select bind:value={editForm.payment_mode}>
									<option value="cash">Cash</option>
									<option value="bank">Bank</option>
								</select>
							</div>
							<div class="field full-width">
								<label>Address</label>
								<textarea bind:value={editForm.address} rows="2"></textarea>
							</div>
							<div class="field">
								<label>State</label>
								<input type="text" bind:value={editForm.state} />
							</div>
							<div class="field">
								<label>District</label>
								<input type="text" bind:value={editForm.district} />
							</div>
							<div class="field">
								<label>Status</label>
								<select bind:value={editForm.is_active}>
									<option value={true}>Active</option>
									<option value={false}>Inactive</option>
								</select>
							</div>
						</div>
						<div class="form-actions">
							<button class="btn-secondary" onclick={cancelEdit}>Cancel</button>
							<button class="btn-primary" onclick={handleEdit} disabled={editLoading}>
								{editLoading ? 'Saving...' : 'Save Changes'}
							</button>
						</div>
					</div>
				{:else}
					<!-- Search & List -->
					<div class="search-bar">
						<input type="text" bind:value={searchQuery} placeholder="Search suppliers..." onkeydown={(e) => e.key === 'Enter' && doSearch()} />
						<button class="btn-primary btn-sm" onclick={doSearch}>Search</button>
					</div>

					{#if loading}
						<div class="loading-msg">Loading...</div>
					{:else if suppliers.length === 0}
						<div class="empty-msg">No suppliers found. Create one first.</div>
					{:else}
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th class="hide-mobile">Code</th>
										<th>Supplier Name</th>
										<th class="hide-mobile">Contact</th>
										<th>Phone</th>
										<th class="hide-mobile">GSTIN</th>
										<th class="hide-mobile">Terms</th>
										<th class="hide-mobile">Mode</th>
										<th class="hide-mobile">Status</th>
										{#if permEdit}<th>Actions</th>{/if}
									</tr>
								</thead>
								<tbody>
									{#each suppliers as sup}
										<tr>
											<td class="code hide-mobile">{sup.supplier_code}</td>
											<td>
												<div class="sup-name-cell">
													<span class="sup-title">{sup.supplier_name}</span>
													<span class="sup-meta-mobile">{sup.supplier_code} • {sup.contact_person || 'No Contact'}</span>
												</div>
											</td>
											<td class="hide-mobile">{sup.contact_person || '—'}</td>
											<td>{sup.phone || '—'}</td>
											<td class="hide-mobile">{sup.gstin || '—'}</td>
											<td class="terms hide-mobile">{formatTerms(sup.payment_terms, sup.credit_period_days)}</td>
											<td class="terms hide-mobile">{sup.payment_mode === 'bank' ? 'Bank' : 'Cash'}</td>
											<td class="hide-mobile">
												<span class="badge" class:active={sup.is_active} class:inactive={!sup.is_active}>
													{sup.is_active ? 'Active' : 'Inactive'}
												</span>
											</td>
											{#if permEdit}
												<td>
													<button class="btn-ghost btn-xs" onclick={() => startEdit(sup)}>✏️ Edit</button>
												</td>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						{#if totalCount > pageSize}
							<div class="pagination">
								<button disabled={currentPage <= 1} onclick={() => { currentPage--; loadSuppliers(); }}>← Prev</button>
								<span>Page {currentPage} of {Math.ceil(totalCount / pageSize)}</span>
								<button disabled={currentPage >= Math.ceil(totalCount / pageSize)} onclick={() => { currentPage++; loadSuppliers(); }}>Next →</button>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<script lang="ts" module>
	function formatTerms(t: string | null, days?: number | null): string {
		if (!t) return '—';
		if (t === 'credit') return days ? `Credit (${days} days)` : 'Credit';
		return 'Immediate';
	}
</script>

<style>
	.suppliers-window {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #F8F8F5;
	}

	.tab-bar {
		display: flex;
		background: white;
		border-bottom: 1px solid #E8E8E8;
		flex-shrink: 0;
	}

	.tab {
		flex: 1;
		padding: 14px 16px;
		border: none;
		background: none;
		font-size: 13px;
		font-weight: 600;
		color: #888;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: all 0.2s;
	}

	.tab:hover { color: #555; background: #fafafa; }
	.tab.active { color: #0E5A3C; border-bottom-color: #0E5A3C; }

	.tab-content {
		flex: 1;
		overflow-y: auto;
	}

	/* Form */
	.form-container {
		padding: 20px;
	}

	.form-card {
		background: white;
		border-radius: 10px;
		padding: 24px;
		box-shadow: 0 1px 4px rgba(0,0,0,0.06);
	}

	.form-card h3 {
		margin: 0 0 20px;
		font-size: 15px;
		font-weight: 700;
		color: #2B2B2B;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.field { display: flex; flex-direction: column; gap: 4px; }
	.field.full-width { grid-column: 1 / -1; }

	.field label {
		font-size: 12px;
		font-weight: 600;
		color: #555;
	}

	.req { color: #e53e3e; }

	.field input, .field select, .field textarea {
		padding: 9px 12px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 13px;
		background: #fafafa;
		transition: border-color 0.2s;
	}

	.field input:focus, .field select:focus, .field textarea:focus {
		outline: none;
		border-color: #0E5A3C;
		background: white;
	}

	.field textarea { resize: vertical; font-family: inherit; }

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid #eee;
	}

	/* Buttons */
	.btn-primary {
		padding: 9px 20px;
		background: #0E5A3C;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-primary:hover { background: #0a4a30; }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-secondary {
		padding: 9px 20px;
		background: #f0f0f0;
		color: #333;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-secondary:hover { background: #e5e5e5; }

	.btn-ghost {
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
		font-size: 13px;
	}
	.btn-ghost:hover { color: #333; }

	.btn-sm { padding: 7px 14px; font-size: 12px; }
	.btn-xs { padding: 4px 8px; font-size: 12px; }

	/* Manage */
	.manage-container { padding: 20px; }

	.search-bar {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
	}

	.search-bar input {
		flex: 1;
		padding: 9px 12px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 13px;
	}

	.search-bar input:focus { outline: none; border-color: #0E5A3C; }

	.edit-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.edit-header h3 { margin: 0; }

	/* Table */
	.table-wrap {
		background: white;
		border-radius: 8px;
		overflow: auto;
		box-shadow: 0 1px 4px rgba(0,0,0,0.06);
	}

	table { width: 100%; border-collapse: collapse; font-size: 13px; }

	thead th {
		padding: 10px 12px;
		text-align: left;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		color: #777;
		background: #fafafa;
		border-bottom: 1px solid #eee;
	}

	tbody td {
		padding: 10px 12px;
		border-bottom: 1px solid #f0f0f0;
		color: #333;
	}

	tbody tr:hover { background: #f9f9f7; }

	.code { font-family: monospace; font-size: 12px; color: #0E5A3C; font-weight: 600; }

	.terms { font-size: 12px; color: #666; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
	}
	.badge.active { background: #e6f4ec; color: #0E5A3C; }
	.badge.inactive { background: #fce8e8; color: #c53030; }

	.loading-msg, .empty-msg {
		text-align: center;
		padding: 40px 20px;
		color: #999;
		font-size: 14px;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 16px;
	}

	.pagination button {
		padding: 6px 14px;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: white;
		font-size: 12px;
		cursor: pointer;
	}
	.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
	.pagination span { font-size: 12px; color: #777; }

	.sup-name-cell { display: flex; flex-direction: column; }
	.sup-title { font-weight: 600; }
	.sup-meta-mobile { display: none; font-size: 10px; color: #888; margin-top: 2px; }

	@media (max-width: 768px) {
		.hide-mobile { display: none !important; }
		.sup-meta-mobile { display: block; }
		.form-grid { grid-template-columns: 1fr; }
		.form-card { padding: 14px; }
		.tab-content { padding: 4px; }
		.form-container { padding: 4px; }
		.manage-container { padding: 4px; }
		.search-bar { flex-wrap: wrap; }
		.search-bar input { flex: 1 1 100%; }
		.search-bar select { flex: 1 1 45%; }
		.form-actions {
			position: sticky;
			bottom: 0;
			background: white;
			padding: 12px 4px;
			margin: 0 -4px;
			box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
			z-index: 10;
		}
	}

	.code { font-family: monospace; font-size: 12px; color: #0E5A3C; font-weight: 600; }

	.terms { font-size: 12px; color: #666; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
	}
	.badge.active { background: #e6f4ec; color: #0E5A3C; }
	.badge.inactive { background: #fce8e8; color: #c53030; }

	.loading-msg, .empty-msg {
		text-align: center;
		padding: 40px 20px;
		color: #999;
		font-size: 14px;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 16px;
	}

	.pagination button {
		padding: 6px 14px;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: white;
		font-size: 12px;
		cursor: pointer;
	}
	.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
	.pagination span { font-size: 12px; color: #777; }
</style>
