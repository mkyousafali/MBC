<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog, diffChanges } from '$lib/utils/audit';

	const RESOURCE_KEY = 'inventory.manage.production';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	type ProductRow = {
		id: string; product_code: string; product_name: string; product_type: string;
		category_name: string | null; base_unit: string | null; gst_percentage: number;
		is_active: boolean; units_count: number; variants_count: number;
		default_supplier_name: string | null;
	};
	type Category = { id: string; name: string };

	let activeView: 'list' | 'create' | 'edit' | 'detail' = $state('list');
	let loading = $state(false);
	let products = $state<ProductRow[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let categories = $state<Category[]>([]);
	let unitsList = $state<any[]>([]);

	// Create form
	let createForm = $state({
		product_name: '', category_id: '', product_type: 'raw_material',
		hsn_code: '', gst_percentage: 0, description: '',
		base_unit_name: '', base_unit_code: '',
		base_purchase_price: 0, base_selling_price: 0, base_mrp: 0,
		min_stock: 0, max_stock: 0, reorder_level: 0
	});
	let createLoading = $state(false);

	// Edit state
	let editProductId = $state('');
	let editProductCode = $state('');
	let editForm: any = $state(null);
	let editFormOriginalJson = '';
	let editLoading = $state(false);
	let selectedProduct: ProductRow | null = $state(null);

	async function loadCategories() {
		const { data } = await supabase.rpc('rpc_list_product_categories', { p_active_only: true });
		categories = (data || []).map((c: any) => ({ id: c.id, name: c.category_name }));
	}

	async function loadUnits() {
		const { data } = await supabase.rpc('rpc_list_units_master');
		unitsList = data || [];
	}

	async function loadProducts(append = false) {
		if (!append) loading = true;
		const { data, error } = await supabase.rpc('rpc_list_products', {
			p_search: searchQuery || null,
			p_category_id: null,
			p_product_type: null,
			p_active_only: false,
			p_limit: 30,
			p_offset: append ? products.length : 0
		});
		loading = false;
		if (error) { toasts.add('Failed to load products', 'error'); return; }
		if (append) {
			products = [...products, ...(data?.data || [])];
		} else {
			products = data?.data || [];
		}
		totalCount = data?.total || 0;
	}

	function doSearch() { loadProducts(); }

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => loadProducts(), 400);
	}

	function typeLabel(t: string) {
		const map: Record<string, string> = { raw_material: 'Raw Material', semi_finished: 'Semi Finished', finished_good: 'Finished Good' };
		return map[t] || t;
	}

	function typeBadge(t: string) {
		const map: Record<string, string> = { raw_material: 'badge-blue', semi_finished: 'badge-orange', finished_good: 'badge-green' };
		return map[t] || '';
	}

	// View detail
	async function viewDetail(prod: ProductRow) {
		selectedProduct = prod;
		activeView = 'detail';
	}

	// Create
	function openCreate() {
		resetCreateForm();
		activeView = 'create';
	}

	function resetCreateForm() {
		createForm = {
			product_name: '', category_id: '', product_type: 'raw_material',
			hsn_code: '', gst_percentage: 0, description: '',
			base_unit_name: '', base_unit_code: '',
			base_purchase_price: 0, base_selling_price: 0, base_mrp: 0,
			min_stock: 0, max_stock: 0, reorder_level: 0
		};
	}

	function onUnitSelect(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const u = unitsList.find((x: any) => x.unit_name === val);
		if (u) {
			createForm.base_unit_name = u.unit_name;
			createForm.base_unit_code = u.unit_short_code;
		}
	}

	async function handleCreate() {
		if (!createForm.product_name.trim()) { toasts.add('Product name is required', 'error'); return; }
		if (!createForm.base_unit_name) { toasts.add('Base unit is required', 'error'); return; }

		createLoading = true;
		const units = [{ unit_name: createForm.base_unit_name, unit_short_code: createForm.base_unit_code, is_base_unit: true, conversion_factor: 1, purchase_price: createForm.base_purchase_price, selling_price: createForm.base_selling_price, mrp: createForm.base_mrp }];

		const { data, error } = await supabase.rpc('rpc_create_product', {
			p_product_name: createForm.product_name.trim(),
			p_category_id: createForm.category_id || null,
			p_product_type: createForm.product_type,
			p_hsn_code: createForm.hsn_code.trim() || null,
			p_gst_percentage: createForm.gst_percentage || 0,
			p_description: createForm.description.trim() || null,
			p_min_stock: createForm.min_stock || 0,
			p_max_stock: createForm.max_stock || 0,
			p_reorder_level: createForm.reorder_level || 0,
			p_is_active: true,
			p_units: JSON.stringify(units),
			p_barcodes: JSON.stringify([]),
			p_variants: JSON.stringify([]),
			p_default_supplier_id: null
		});
		createLoading = false;

		if (error) { toasts.add('Create failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Create failed', 'error'); return; }

		toasts.add('Product created! Code: ' + data.product_code, 'success');
		writeAuditLog({ action: 'create', resourceType: 'product', resourceId: data.product_id, resourceLabel: createForm.product_name.trim(), details: { product_code: data.product_code } });
		activeView = 'list';
		loadProducts();
	}

	// Edit
	async function startEdit(prod: ProductRow) {
		const { data, error } = await supabase.rpc('rpc_get_product_detail', { p_product_id: prod.id });
		if (error || !data?.success) { toasts.add('Failed to load product', 'error'); return; }

		const p = data.product;
		const units: any[] = data.units || [];
		const baseUnit = units.find((u: any) => u.is_base_unit) || units[0];

		editProductId = prod.id;
		editProductCode = prod.product_code;
		editForm = {
			product_name: p.product_name || '',
			category_id: p.category_id || '',
			product_type: p.product_type || 'raw_material',
			hsn_code: p.hsn_code || '',
			gst_percentage: p.gst_percentage || 0,
			description: p.description || '',
			base_unit_name: baseUnit?.unit_name || '',
			base_unit_code: baseUnit?.unit_short_code || '',
			base_purchase_price: baseUnit?.purchase_price || 0,
			base_selling_price: baseUnit?.selling_price || 0,
			base_mrp: baseUnit?.mrp || 0,
			min_stock: p.min_stock_level || 0,
			max_stock: p.max_stock_level || 0,
			reorder_level: p.reorder_level || 0,
			is_active: p.is_active
		};
		editFormOriginalJson = JSON.stringify({
			product_name: editForm.product_name, category_id: editForm.category_id,
			product_type: editForm.product_type, hsn_code: editForm.hsn_code,
			gst_percentage: editForm.gst_percentage, description: editForm.description,
			base_unit_name: editForm.base_unit_name, base_purchase_price: editForm.base_purchase_price,
			base_selling_price: editForm.base_selling_price, base_mrp: editForm.base_mrp,
			min_stock: editForm.min_stock, max_stock: editForm.max_stock,
			reorder_level: editForm.reorder_level, is_active: editForm.is_active
		});
		activeView = 'edit';
	}

	function onEditUnitSelect(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const u = unitsList.find((x: any) => x.unit_name === val);
		if (u) {
			editForm.base_unit_name = u.unit_name;
			editForm.base_unit_code = u.unit_short_code;
		}
	}

	async function handleEdit() {
		if (!editForm) return;
		if (!editForm.product_name.trim()) { toasts.add('Product name is required', 'error'); return; }

		editLoading = true;
		const units = [{ unit_name: editForm.base_unit_name, unit_short_code: editForm.base_unit_code, is_base_unit: true, conversion_factor: 1, purchase_price: editForm.base_purchase_price, selling_price: editForm.base_selling_price, mrp: editForm.base_mrp }];

		const { data, error } = await supabase.rpc('rpc_update_product_full', {
			p_product_id: editProductId,
			p_product_name: editForm.product_name.trim(),
			p_category_id: editForm.category_id || null,
			p_product_type: editForm.product_type,
			p_hsn_code: editForm.hsn_code.trim() || null,
			p_gst_percentage: editForm.gst_percentage || 0,
			p_description: editForm.description.trim() || null,
			p_default_supplier_id: null,
			p_min_stock: editForm.min_stock || 0,
			p_max_stock: editForm.max_stock || 0,
			p_reorder_level: editForm.reorder_level || 0,
			p_is_active: editForm.is_active,
			p_units: JSON.stringify(units),
			p_barcodes: JSON.stringify([]),
			p_variants: JSON.stringify([])
		});
		editLoading = false;

		if (error) { toasts.add('Update failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Update failed', 'error'); return; }

		toasts.add('Product updated! ' + editProductCode, 'success');
		const editOriginal = editFormOriginalJson ? JSON.parse(editFormOriginalJson) : {};
		const editCurrent = {
			product_name: editForm.product_name, category_id: editForm.category_id,
			product_type: editForm.product_type, hsn_code: editForm.hsn_code,
			gst_percentage: editForm.gst_percentage, description: editForm.description,
			base_unit_name: editForm.base_unit_name, base_purchase_price: editForm.base_purchase_price,
			base_selling_price: editForm.base_selling_price, base_mrp: editForm.base_mrp,
			min_stock: editForm.min_stock, max_stock: editForm.max_stock,
			reorder_level: editForm.reorder_level, is_active: editForm.is_active
		};
		const changes = diffChanges(editOriginal, editCurrent);
		writeAuditLog({ action: 'update', resourceType: 'product', resourceId: editProductId, resourceLabel: editForm.product_name.trim(), changes });

		// Status change audit
		if (editOriginal.is_active !== editCurrent.is_active) {
			writeAuditLog({ action: 'status_change', resourceType: 'product', resourceId: editProductId, resourceLabel: editForm.product_name.trim(), changes: [{ field: 'is_active', from: editOriginal.is_active, to: editCurrent.is_active }] });
		}

		activeView = 'list';
		loadProducts();
	}

	function goBack() {
		if (activeView === 'detail' || activeView === 'create' || activeView === 'edit') {
			activeView = 'list';
		}
	}

	onMount(() => {
		loadProducts();
		loadCategories();
		loadUnits();
	});
</script>

<div class="mobile-products">
	{#if activeView === 'list'}
		<!-- LIST VIEW -->
		<div class="page-title">
			<h2>📦 Products</h2>
			{#if permAdd}
				<button class="btn-add" onclick={openCreate}>+ New</button>
			{/if}
		</div>

		<div class="search-bar">
			<input type="text" placeholder="Search products..." bind:value={searchQuery} oninput={onSearchInput} onkeydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
			<button class="btn-search" onclick={doSearch}>🔍</button>
		</div>

		{#if loading}
			<div class="loading-state">Loading...</div>
		{:else if products.length === 0}
			<div class="empty-state">No products found.</div>
		{:else}
			<div class="card-list">
				{#each products as prod}
					<div class="item-card" onclick={() => viewDetail(prod)}>
						<div class="card-top">
							<span class="card-code">{prod.product_code}</span>
							<span class="badge {typeBadge(prod.product_type)}">{typeLabel(prod.product_type)}</span>
						</div>
						<div class="card-name">{prod.product_name}</div>
						<div class="card-meta">
							{#if prod.category_name}<span>📂 {prod.category_name}</span>{/if}
							{#if prod.base_unit}<span>📏 {prod.base_unit}</span>{/if}
							<span>🏷️ GST {prod.gst_percentage}%</span>
						</div>
						<div class="card-bottom">
							<span class="status-dot" class:active={prod.is_active} class:inactive={!prod.is_active}>{prod.is_active ? 'Active' : 'Inactive'}</span>
							{#if permEdit}
								<button class="btn-action" onclick={(e) => { e.stopPropagation(); startEdit(prod); }}>✏️ Edit</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if products.length < totalCount}
				<button class="btn-load-more" onclick={() => loadProducts(true)}>Load More ({products.length}/{totalCount})</button>
			{/if}
		{/if}

	{:else if activeView === 'detail'}
		<!-- DETAIL VIEW -->
		<div class="page-title">
			<button class="btn-back" onclick={goBack}>←</button>
			<h2>{selectedProduct?.product_name || 'Product'}</h2>
		</div>

		{#if selectedProduct}
			<div class="detail-card">
				<div class="detail-row"><span class="label">Code</span><span>{selectedProduct.product_code}</span></div>
				<div class="detail-row"><span class="label">Name</span><span>{selectedProduct.product_name}</span></div>
				<div class="detail-row"><span class="label">Type</span><span class="badge {typeBadge(selectedProduct.product_type)}">{typeLabel(selectedProduct.product_type)}</span></div>
				<div class="detail-row"><span class="label">Category</span><span>{selectedProduct.category_name || '—'}</span></div>
				<div class="detail-row"><span class="label">Base Unit</span><span>{selectedProduct.base_unit || '—'}</span></div>
				<div class="detail-row"><span class="label">GST</span><span>{selectedProduct.gst_percentage}%</span></div>
				<div class="detail-row"><span class="label">Units</span><span>{selectedProduct.units_count}</span></div>
				<div class="detail-row"><span class="label">Variants</span><span>{selectedProduct.variants_count}</span></div>
				<div class="detail-row"><span class="label">Supplier</span><span>{selectedProduct.default_supplier_name || '—'}</span></div>
				<div class="detail-row"><span class="label">Status</span><span class="status-dot" class:active={selectedProduct.is_active} class:inactive={!selectedProduct.is_active}>{selectedProduct.is_active ? 'Active' : 'Inactive'}</span></div>
			</div>
			{#if permEdit}
				<button class="btn-primary full-width" onclick={() => startEdit(selectedProduct!)}>✏️ Edit Product</button>
			{/if}
		{/if}

	{:else if activeView === 'create'}
		<!-- CREATE VIEW -->
		<div class="page-title">
			<button class="btn-back" onclick={goBack}>←</button>
			<h2>New Product</h2>
		</div>

		<div class="form-container">
			<div class="form-section">
				<h3>Basic Info</h3>
				<label class="field">
					<span>Product Name *</span>
					<input type="text" bind:value={createForm.product_name} placeholder="Enter product name" />
				</label>
				<label class="field">
					<span>Type</span>
					<select bind:value={createForm.product_type}>
						<option value="raw_material">Raw Material</option>
						<option value="semi_finished">Semi Finished</option>
						<option value="finished_good">Finished Good</option>
					</select>
				</label>
				<label class="field">
					<span>Category</span>
					<select bind:value={createForm.category_id}>
						<option value="">— Select —</option>
						{#each categories as cat}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
				</label>
				<div class="field-row">
					<label class="field half">
						<span>HSN Code</span>
						<input type="text" bind:value={createForm.hsn_code} placeholder="HSN" />
					</label>
					<label class="field half">
						<span>GST %</span>
						<input type="number" bind:value={createForm.gst_percentage} min="0" max="28" step="0.1" />
					</label>
				</div>
				<label class="field">
					<span>Description</span>
					<textarea bind:value={createForm.description} rows="2" placeholder="Optional"></textarea>
				</label>
			</div>

			<div class="form-section">
				<h3>Base Unit & Pricing</h3>
				<label class="field">
					<span>Base Unit *</span>
					<select value={createForm.base_unit_name} onchange={onUnitSelect}>
						<option value="">— Select Unit —</option>
						{#each unitsList as u}
							<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
						{/each}
					</select>
				</label>
				<div class="field-row">
					<label class="field third">
						<span>Purchase ₹</span>
						<input type="number" bind:value={createForm.base_purchase_price} min="0" step="0.01" />
					</label>
					<label class="field third">
						<span>Selling ₹</span>
						<input type="number" bind:value={createForm.base_selling_price} min="0" step="0.01" />
					</label>
					<label class="field third">
						<span>MRP ₹</span>
						<input type="number" bind:value={createForm.base_mrp} min="0" step="0.01" />
					</label>
				</div>
			</div>

			<div class="form-section">
				<h3>Stock Levels</h3>
				<div class="field-row">
					<label class="field third">
						<span>Min</span>
						<input type="number" bind:value={createForm.min_stock} min="0" />
					</label>
					<label class="field third">
						<span>Max</span>
						<input type="number" bind:value={createForm.max_stock} min="0" />
					</label>
					<label class="field third">
						<span>Reorder</span>
						<input type="number" bind:value={createForm.reorder_level} min="0" />
					</label>
				</div>
			</div>

			<button class="btn-primary full-width" onclick={handleCreate} disabled={createLoading}>
				{createLoading ? 'Creating...' : '✅ Create Product'}
			</button>
		</div>

	{:else if activeView === 'edit'}
		<!-- EDIT VIEW -->
		<div class="page-title">
			<button class="btn-back" onclick={goBack}>←</button>
			<h2>✏️ {editProductCode}</h2>
		</div>

		{#if editForm}
			<div class="form-container">
				<div class="form-section">
					<h3>Basic Info</h3>
					<label class="field">
						<span>Product Name *</span>
						<input type="text" bind:value={editForm.product_name} />
					</label>
					<label class="field">
						<span>Type</span>
						<select bind:value={editForm.product_type}>
							<option value="raw_material">Raw Material</option>
							<option value="semi_finished">Semi Finished</option>
							<option value="finished_good">Finished Good</option>
						</select>
					</label>
					<label class="field">
						<span>Category</span>
						<select bind:value={editForm.category_id}>
							<option value="">— Select —</option>
							{#each categories as cat}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</label>
					<div class="field-row">
						<label class="field half">
							<span>HSN Code</span>
							<input type="text" bind:value={editForm.hsn_code} />
						</label>
						<label class="field half">
							<span>GST %</span>
							<input type="number" bind:value={editForm.gst_percentage} min="0" max="28" step="0.1" />
						</label>
					</div>
					<label class="field">
						<span>Description</span>
						<textarea bind:value={editForm.description} rows="2"></textarea>
					</label>
				</div>

				<div class="form-section">
					<h3>Base Unit & Pricing</h3>
					<label class="field">
						<span>Base Unit</span>
						<select value={editForm.base_unit_name} onchange={onEditUnitSelect}>
							<option value="">— Select Unit —</option>
							{#each unitsList as u}
								<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
							{/each}
						</select>
					</label>
					<div class="field-row">
						<label class="field third">
							<span>Purchase ₹</span>
							<input type="number" bind:value={editForm.base_purchase_price} min="0" step="0.01" />
						</label>
						<label class="field third">
							<span>Selling ₹</span>
							<input type="number" bind:value={editForm.base_selling_price} min="0" step="0.01" />
						</label>
						<label class="field third">
							<span>MRP ₹</span>
							<input type="number" bind:value={editForm.base_mrp} min="0" step="0.01" />
						</label>
					</div>
				</div>

				<div class="form-section">
					<h3>Stock Levels</h3>
					<div class="field-row">
						<label class="field third">
							<span>Min</span>
							<input type="number" bind:value={editForm.min_stock} min="0" />
						</label>
						<label class="field third">
							<span>Max</span>
							<input type="number" bind:value={editForm.max_stock} min="0" />
						</label>
						<label class="field third">
							<span>Reorder</span>
							<input type="number" bind:value={editForm.reorder_level} min="0" />
						</label>
					</div>
				</div>

				<div class="form-section">
					<h3>Status</h3>
					<label class="toggle-field">
						<span>Active</span>
						<input type="checkbox" bind:checked={editForm.is_active} />
					</label>
				</div>

				<button class="btn-primary full-width" onclick={handleEdit} disabled={editLoading}>
					{editLoading ? 'Updating...' : '✅ Update Product'}
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.mobile-products { padding: 16px; padding-bottom: 80px; }

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

	.badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; }
	.badge-blue { background: #EBF5FB; color: #2980B9; }
	.badge-orange { background: #FEF5E7; color: #E67E22; }
	.badge-green { background: #E8F8F5; color: #1ABC9C; }

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
	.field.third { flex: 1; min-width: 0; }
	.field input, .field select, .field textarea { width: 100%; box-sizing: border-box; }

	.toggle-field { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
	.toggle-field span { font-size: 14px; font-weight: 600; color: #555; }
	.toggle-field input[type="checkbox"] { width: 20px; height: 20px; accent-color: #0E5A3C; }

	.btn-primary { background: #0E5A3C; color: white; border: none; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
	.btn-primary:active { background: #0A3F2C; }
	.btn-primary:disabled { opacity: 0.6; cursor: default; }
	.full-width { width: 100%; }
</style>
