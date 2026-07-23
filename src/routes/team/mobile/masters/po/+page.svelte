<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog } from '$lib/utils/audit';

	const RESOURCE_KEY = 'inventory.operations.po';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	let currentUserId = $state('');
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; currentUserId = u?.user_id || ''; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	type SearchProduct = { id: string; product_code: string; product_name: string; product_type: string; gst_percentage: number; category_name?: string; units: any[] };
	type UnitMaster = { id: string; unit_name: string; unit_short_code: string };
	type POItem = { product_id: string; product_code: string; product_name: string; selected_unit: string; quantity: number };
	type Supplier = { id: string; supplier_code: string; supplier_name: string };
	type SavedPO = { id: string; po_number: string; po_type: string; po_date: string; status: string; total_amount: number; notes: string | null; supplier_name: string | null; supplier_code: string | null; items_count: number; created_at: string };
	type PODetailItem = { id: string; product_id: string; product_code: string; product_name: string; unit_name: string; unit_short_code: string; quantity: number };

	let activeView: 'list' | 'general' | 'supplier' | 'detail' = $state('list');
	let allUnits = $state<UnitMaster[]>([]);

	// General PO
	let generalItems = $state<POItem[]>([]);
	let showProductSearch = $state(false);
	let productSearchQuery = $state('');
	let productSearchResults = $state<SearchProduct[]>([]);
	let productSearching = $state(false);
	let generalNotes = $state('');

	// Supplier PO
	let suppliers = $state<Supplier[]>([]);
	let selectedSupplierId = $state('');
	let supplierItems = $state<POItem[]>([]);
	let loadingSupplierProducts = $state(false);
	let supplierNotes = $state('');

	let saving = $state(false);

	// Saved POs
	let savedPOs = $state<SavedPO[]>([]);
	let savedTotal = $state(0);
	let savedLoading = $state(false);
	let savedSearch = $state('');
	let savedStatusFilter = $state('');

	// Detail
	let detailPO = $state<any>(null);
	let detailItems = $state<PODetailItem[]>([]);
	let detailLoading = $state(false);

	// Share
	let showSharePanel = $state(false);
	let shareIncludeCode = $state(true);
	let shareIncludeProduct = $state(true);
	let shareIncludeUnit = $state(true);
	let shareIncludeQty = $state(true);

	async function loadAllUnits() {
		const { data } = await supabase.rpc('rpc_list_units_master', { p_active_only: true });
		allUnits = data || [];
	}

	async function loadSuppliers() {
		const { data } = await supabase.rpc('rpc_list_suppliers', { p_search: null, p_active_only: true, p_limit: 500, p_offset: 0 });
		suppliers = (data?.data || []).map((s: any) => ({ id: s.id, supplier_code: s.supplier_code, supplier_name: s.supplier_name }));
	}

	// ============ LIST ============

	async function loadSavedPOs(append = false) {
		if (!append) savedLoading = true;
		const { data, error } = await supabase.rpc('rpc_list_purchase_orders', {
			p_search: savedSearch || null,
			p_status: savedStatusFilter || null,
			p_po_type: null,
			p_limit: 20,
			p_offset: append ? savedPOs.length : 0
		});
		savedLoading = false;
		if (error) { toasts.add('Failed to load POs', 'error'); return; }
		if (append) {
			savedPOs = [...savedPOs, ...(data?.data || [])];
		} else {
			savedPOs = data?.data || [];
		}
		savedTotal = data?.total || 0;
	}

	let savedSearchTimer: ReturnType<typeof setTimeout> | null = null;
	function onSavedSearchInput() {
		if (savedSearchTimer) clearTimeout(savedSearchTimer);
		savedSearchTimer = setTimeout(() => loadSavedPOs(), 400);
	}

	// ============ GENERAL PO ============

	async function searchProducts() {
		if (!productSearchQuery.trim()) return;
		productSearching = true;
		const { data, error } = await supabase.rpc('rpc_search_products_for_po', { p_search: productSearchQuery.trim(), p_limit: 30 });
		productSearching = false;
		if (error) { toasts.add('Search failed', 'error'); return; }
		productSearchResults = data || [];
	}

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => searchProducts(), 350);
	}

	function addProductToGeneral(prod: SearchProduct) {
		if (generalItems.some(i => i.product_id === prod.id)) {
			toasts.add('Already added', 'info');
			return;
		}
		const baseUnit = prod.units?.find((u: any) => u.is_base_unit) || prod.units?.[0];
		generalItems = [...generalItems, {
			product_id: prod.id,
			product_code: prod.product_code,
			product_name: prod.product_name,
			selected_unit: baseUnit?.unit_name || '',
			quantity: 0
		}];
		showProductSearch = false;
		productSearchQuery = '';
		productSearchResults = [];
	}

	function removeGeneralItem(idx: number) {
		generalItems = generalItems.filter((_, i) => i !== idx);
	}

	async function saveGeneralPO() {
		if (generalItems.length === 0) { toasts.add('Add at least one product', 'error'); return; }
		saving = true;
		const items = generalItems.map(i => {
			const u = allUnits.find(x => x.unit_name === i.selected_unit);
			return { product_id: i.product_id, unit_name: i.selected_unit, unit_short_code: u?.unit_short_code || '', conversion_factor: 1, quantity: i.quantity, unit_price: 0 };
		});
		const { data, error } = await supabase.rpc('rpc_create_purchase_order', {
			p_supplier_id: null, p_po_type: 'general', p_notes: generalNotes.trim() || null,
			p_items: items, p_created_by: currentUserId
		});
		saving = false;
		if (error) { toasts.add('Save failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Save failed', 'error'); return; }
		toasts.add('PO created! ' + data.po_number, 'success');
		writeAuditLog({ action: 'create', resourceType: 'purchase_order', resourceId: data.po_id, resourceLabel: data.po_number, details: { type: 'general', items_count: items.length } });
		generalItems = [];
		generalNotes = '';
		activeView = 'list';
		loadSavedPOs();
	}

	// ============ SUPPLIER PO ============

	async function onSupplierSelect() {
		if (!selectedSupplierId) { supplierItems = []; return; }
		loadingSupplierProducts = true;
		const { data, error } = await supabase.rpc('rpc_get_products_by_supplier', { p_supplier_id: selectedSupplierId });
		loadingSupplierProducts = false;
		if (error) { toasts.add('Failed to load products', 'error'); return; }
		const products: SearchProduct[] = data || [];
		supplierItems = products.map(prod => {
			const baseUnit = prod.units?.find((u: any) => u.is_base_unit) || prod.units?.[0];
			return {
				product_id: prod.id,
				product_code: prod.product_code,
				product_name: prod.product_name,
				selected_unit: baseUnit?.unit_name || '',
				quantity: 0
			};
		});
	}

	function removeSupplierItem(idx: number) {
		supplierItems = supplierItems.filter((_, i) => i !== idx);
	}

	async function saveSupplierPO() {
		const activeItems = supplierItems.filter(i => i.quantity > 0);
		if (activeItems.length === 0) { toasts.add('Add quantities to at least one product', 'error'); return; }
		saving = true;
		const sup = suppliers.find(s => s.id === selectedSupplierId);
		const items = activeItems.map(i => {
			const u = allUnits.find(x => x.unit_name === i.selected_unit);
			return { product_id: i.product_id, unit_name: i.selected_unit, unit_short_code: u?.unit_short_code || '', conversion_factor: 1, quantity: i.quantity, unit_price: 0 };
		});
		const { data, error } = await supabase.rpc('rpc_create_purchase_order', {
			p_supplier_id: selectedSupplierId, p_po_type: 'supplier_specific', p_notes: supplierNotes.trim() || null,
			p_items: items, p_created_by: currentUserId
		});
		saving = false;
		if (error) { toasts.add('Save failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Save failed', 'error'); return; }
		toasts.add('PO created! ' + data.po_number, 'success');
		writeAuditLog({ action: 'create', resourceType: 'purchase_order', resourceId: data.po_id, resourceLabel: data.po_number, details: { type: 'supplier_specific', supplier: sup?.supplier_name, items_count: items.length } });
		supplierItems = [];
		supplierNotes = '';
		selectedSupplierId = '';
		activeView = 'list';
		loadSavedPOs();
	}

	// ============ DETAIL ============

	async function viewPODetail(po: SavedPO) {
		detailLoading = true;
		setView('detail');
		showSharePanel = false;
		const { data, error } = await supabase.rpc('rpc_get_purchase_order_detail', { p_po_id: po.id });
		detailLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load PO details', 'error'); setView('list'); return; }
		detailPO = data.po;
		detailItems = data.items || [];
	}

	function statusLabel(s: string) {
		const map: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', partially_received: 'Partial', received: 'Received', cancelled: 'Cancelled' };
		return map[s] || s;
	}

	function statusClass(s: string) {
		const map: Record<string, string> = { draft: 'st-draft', submitted: 'st-submitted', approved: 'st-approved', partially_received: 'st-partial', received: 'st-received', cancelled: 'st-cancelled' };
		return map[s] || '';
	}

	function formatDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	// ============ SHARE ============

	function buildShareText(plain = false): string {
		if (!detailPO) return '';
		let lines: string[] = [];
		lines.push(`${plain ? '' : '📋 '}Purchase Order: ${detailPO.po_number}`);
		lines.push(`${plain ? '' : '📅 '}Date: ${formatDate(detailPO.po_date)}`);
		if (detailPO.supplier_name) lines.push(`${plain ? '' : '🚚 '}Supplier: ${detailPO.supplier_name}`);
		lines.push('');
		lines.push('--- Items ---');
		detailItems.forEach((item: any, idx: number) => {
			let parts: string[] = [`${idx + 1}.`];
			if (shareIncludeCode) parts.push(item.product_code);
			if (shareIncludeProduct) parts.push(item.product_name);
			if (shareIncludeUnit) parts.push(`[${item.unit_name}]`);
			if (shareIncludeQty) parts.push(`Qty: ${item.quantity}`);
			lines.push(parts.join(' '));
		});
		if (detailPO.notes) { lines.push(''); lines.push(`Notes: ${detailPO.notes}`); }
		return lines.join('\n');
	}

	function shareToWhatsApp() {
		const text = buildShareText(true);
		let phone = detailPO?.supplier_phone || '';
		phone = phone.replace(/\D/g, '');
		if (phone && !phone.startsWith('91') && phone.length === 10) phone = '91' + phone;
		const url = phone
			? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
			: `https://wa.me/?text=${encodeURIComponent(text)}`;
		window.open(url, '_blank');
	}

	function copyShareText() {
		const text = buildShareText(false);
		navigator.clipboard.writeText(text).then(() => {
			toasts.add('Copied to clipboard!', 'success');
		});
	}

	function setView(v: typeof activeView) {
		activeView = v;
		if (v !== 'list') {
			history.pushState({ poView: v }, '');
		}
	}

	function onPopState(e: PopStateEvent) {
		if (activeView !== 'list') {
			activeView = 'list';
		}
	}

	onMount(() => { loadAllUnits(); loadSuppliers(); loadSavedPOs(); });
</script>

<svelte:window onpopstate={onPopState} />

<div class="mobile-po">
	{#if activeView === 'list'}
		<!-- LIST VIEW -->
		{#if permAdd}
			<div class="create-buttons">
			<button class="btn-create-type" onclick={() => { setView('general'); }}>
				📋 General PO
			</button>
			<button class="btn-create-type" onclick={() => { setView('supplier'); }}>
					🚚 Supplier PO
				</button>
			</div>
		{/if}

		<div class="search-bar">
			<input type="text" placeholder="Search PO number or supplier..." bind:value={savedSearch} oninput={onSavedSearchInput} />
			<select class="filter-select" bind:value={savedStatusFilter} onchange={() => loadSavedPOs()}>
				<option value="">All</option>
				<option value="draft">Draft</option>
				<option value="submitted">Submitted</option>
				<option value="approved">Approved</option>
				<option value="received">Received</option>
				<option value="cancelled">Cancelled</option>
			</select>
		</div>

		{#if savedLoading}
			<div class="loading-state">Loading...</div>
		{:else if savedPOs.length === 0}
			<div class="empty-state">No purchase orders found.</div>
		{:else}
			<div class="card-list">
				{#each savedPOs as po}
					<div class="item-card" onclick={() => viewPODetail(po)}>
						<div class="card-top">
							<span class="card-code">{po.po_number}</span>
							<span class="status-badge {statusClass(po.status)}">{statusLabel(po.status)}</span>
						</div>
						<div class="card-name">
							{po.po_type === 'general' ? '📋 General' : '🚚 Supplier'}
							{#if po.supplier_name} — {po.supplier_name}{/if}
						</div>
						<div class="card-meta">
							<span>📅 {formatDate(po.po_date)}</span>
							<span>📦 {po.items_count} items</span>
						</div>
					</div>
				{/each}
			</div>

			{#if savedPOs.length < savedTotal}
				<button class="btn-load-more" onclick={() => loadSavedPOs(true)}>Load More ({savedPOs.length}/{savedTotal})</button>
			{/if}
		{/if}

	{:else if activeView === 'general'}
		<!-- GENERAL PO CREATE -->
		<div class="action-bar">
			<button class="btn-add" onclick={() => { showProductSearch = true; productSearchQuery = ''; productSearchResults = []; }}>
				+ Add Product
			</button>
		</div>

		{#if generalItems.length === 0}
			<div class="empty-state">No products added. Tap "+ Add Product" to search and add.</div>
		{:else}
			<div class="items-list">
				{#each generalItems as item, idx}
					<div class="po-item-card">
						<div class="po-item-top">
							<span class="po-item-sno">{idx + 1}</span>
							<span class="po-item-code">{item.product_code}</span>
							<button class="btn-remove" onclick={() => removeGeneralItem(idx)}>✕</button>
						</div>
						<div class="po-item-name">{item.product_name}</div>
						<div class="po-item-fields">
							<div class="po-field">
								<span>Unit</span>
								<select bind:value={item.selected_unit}>
									{#each allUnits as u}
										<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
									{/each}
								</select>
							</div>
							<div class="po-field qty-field">
								<span>Qty</span>
								<div class="qty-row">
									<input type="number" min="0" step="any" bind:value={item.quantity} />
									<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="form-section notes-section">
				<textarea bind:value={generalNotes} placeholder="Notes (optional)" rows="2"></textarea>
			</div>

			{#if permAdd}
				<button class="btn-primary full-width" onclick={saveGeneralPO} disabled={saving || generalItems.length === 0}>
					{saving ? '⏳ Saving...' : '💾 Save PO'}
				</button>
			{/if}
		{/if}

	{:else if activeView === 'supplier'}
		<!-- SUPPLIER PO CREATE -->
		<div class="form-section">
			<div class="field">
				<span>Select Supplier</span>
				<select bind:value={selectedSupplierId} onchange={onSupplierSelect}>
					<option value="">— Choose Supplier —</option>
					{#each suppliers as sup}
						<option value={sup.id}>{sup.supplier_name} ({sup.supplier_code})</option>
					{/each}
				</select>
			</div>
		</div>

		{#if loadingSupplierProducts}
			<div class="loading-state">Loading products...</div>
		{:else if selectedSupplierId && supplierItems.length === 0}
			<div class="empty-state">No products found for this supplier.</div>
		{:else if supplierItems.length > 0}
			<div class="items-list">
				{#each supplierItems as item, idx}
					<div class="po-item-card">
						<div class="po-item-top">
							<span class="po-item-sno">{idx + 1}</span>
							<span class="po-item-code">{item.product_code}</span>
							<button class="btn-remove" onclick={() => removeSupplierItem(idx)}>✕</button>
						</div>
						<div class="po-item-name">{item.product_name}</div>
						<div class="po-item-fields">
							<div class="po-field">
								<span>Unit</span>
								<select bind:value={item.selected_unit}>
									{#each allUnits as u}
										<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
									{/each}
								</select>
							</div>
							<div class="po-field qty-field">
								<span>Qty</span>
								<div class="qty-row">
									<input type="number" min="0" step="any" bind:value={item.quantity} />
									<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="form-section notes-section">
				<textarea bind:value={supplierNotes} placeholder="Notes (optional)" rows="2"></textarea>
			</div>

			{#if permAdd}
				<button class="btn-primary full-width" onclick={saveSupplierPO} disabled={saving}>
					{saving ? '⏳ Saving...' : '💾 Save PO'}
				</button>
			{/if}
		{/if}

	{:else if activeView === 'detail'}
		<!-- DETAIL VIEW -->
		{#if detailLoading}
			<div class="loading-state">Loading details...</div>
		{:else if detailPO}
			<div class="detail-card">
				<div class="detail-row"><span class="label">PO Number</span><span class="mono">{detailPO.po_number}</span></div>
				<div class="detail-row"><span class="label">Type</span><span>{detailPO.po_type === 'general' ? '📋 General' : '🚚 Supplier'}</span></div>
				<div class="detail-row"><span class="label">Date</span><span>{formatDate(detailPO.po_date)}</span></div>
				{#if detailPO.supplier_name}
					<div class="detail-row"><span class="label">Supplier</span><span>{detailPO.supplier_name} ({detailPO.supplier_code})</span></div>
				{/if}
				{#if detailPO.notes}
					<div class="detail-row"><span class="label">Notes</span><span>{detailPO.notes}</span></div>
				{/if}
				<div class="detail-row"><span class="label">Created</span><span>{formatDate(detailPO.created_at)}</span></div>
			</div>

			<h3 class="section-title">📦 Items ({detailItems.length})</h3>
			<div class="items-list">
				{#each detailItems as item, idx}
					<div class="detail-item-card">
						<div class="detail-item-top">
							<span class="di-sno">{idx + 1}</span>
							<span class="di-code">{item.product_code}</span>
						</div>
						<div class="di-name">{item.product_name}</div>
						<div class="di-meta">
							<span>📏 {item.unit_name}</span>
							<span class="di-qty">Qty: {item.quantity}</span>
						</div>
					</div>
				{/each}
			</div>

			<!-- ACTION BUTTONS -->
			<div class="detail-actions">
				<button class="btn-share-wa" onclick={() => { showSharePanel = !showSharePanel; }}>📤 Share</button>
				<button class="btn-copy-text" onclick={copyShareText}>📋 Copy</button>
			</div>

			<!-- SHARE PANEL -->
			{#if showSharePanel}
				<div class="share-panel">
					<h4>📤 Share Options</h4>
					<p class="share-hint">Select fields to include:</p>
					<div class="share-checkboxes">
						<label><input type="checkbox" bind:checked={shareIncludeCode} /> Code</label>
						<label><input type="checkbox" bind:checked={shareIncludeProduct} /> Product</label>
						<label><input type="checkbox" bind:checked={shareIncludeUnit} /> Unit</label>
						<label><input type="checkbox" bind:checked={shareIncludeQty} /> Qty</label>
					</div>
					<div class="share-preview">
						<pre>{buildShareText()}</pre>
					</div>
					<div class="share-buttons">
						<button class="btn-wa" onclick={shareToWhatsApp}>
							💬 {detailPO.supplier_phone ? 'Send to Supplier' : 'WhatsApp'}
						</button>
						<button class="btn-copy" onclick={copyShareText}>📋 Copy Text</button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<!-- Product Search Overlay -->
{#if showProductSearch}
	<div class="search-overlay" onclick={() => { showProductSearch = false; }}>
		<div class="search-popup" onclick={(e) => e.stopPropagation()}>
			<div class="search-popup-header">
				<h3>🔍 Search Products</h3>
				<button class="btn-close" onclick={() => { showProductSearch = false; }}>✕</button>
			</div>
			<div class="search-popup-bar">
				<input
					type="text"
					placeholder="Type product name or code..."
					bind:value={productSearchQuery}
					oninput={onSearchInput}
					onkeydown={(e) => { if (e.key === 'Enter') searchProducts(); }}
				/>
			</div>
			<div class="search-popup-results">
				{#if productSearching}
					<div class="search-hint">Searching...</div>
				{:else if productSearchResults.length === 0 && productSearchQuery}
					<div class="search-hint">No products found.</div>
				{:else}
					{#each productSearchResults as prod}
						<button class="search-result-item" onclick={() => addProductToGeneral(prod)}>
							<span class="sr-code">{prod.product_code}</span>
							<span class="sr-name">{prod.product_name}</span>
							{#if prod.category_name}<span class="sr-cat">{prod.category_name}</span>{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.mobile-po { padding: 16px; padding-bottom: 80px; }

	/* Create type buttons */
	.create-buttons { display: flex; gap: 10px; margin-bottom: 16px; }
	.btn-create-type { flex: 1; padding: 14px 12px; background: white; border: 2px solid #0E5A3C; border-radius: 12px; font-size: 14px; font-weight: 700; color: #0E5A3C; cursor: pointer; text-align: center; transition: all 0.2s; }
	.btn-create-type:active { background: #0E5A3C; color: white; }

	/* Search & Filter */
	.search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
	.search-bar input { flex: 1; padding: 10px 14px; border: 1px solid #E8E8E8; border-radius: 10px; font-size: 14px; background: white; min-width: 0; }
	.search-bar input:focus { outline: none; border-color: #0E5A3C; }
	.filter-select { padding: 10px 8px; border: 1px solid #E8E8E8; border-radius: 10px; font-size: 13px; background: white; }

	.loading-state, .empty-state { text-align: center; padding: 40px 20px; color: #888; font-size: 14px; }

	/* PO List Cards */
	.card-list { display: flex; flex-direction: column; gap: 10px; }

	.item-card {
		background: white; border-radius: 12px; padding: 14px 16px;
		box-shadow: 0 1px 4px rgba(0,0,0,0.07); cursor: pointer; transition: background 0.15s;
	}
	.item-card:active { background: #f8f8f5; }

	.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
	.card-code { font-size: 12px; color: #0E5A3C; font-weight: 700; font-family: monospace; }
	.card-name { font-size: 14px; font-weight: 600; color: #2B2B2B; margin-bottom: 6px; }
	.card-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #777; }

	.status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 6px; white-space: nowrap; }
	.st-draft { background: #f0f0f0; color: #888; }
	.st-submitted { background: #EBF5FB; color: #2980B9; }
	.st-approved { background: #E8F8F5; color: #1ABC9C; }
	.st-partial { background: #FEF5E7; color: #E67E22; }
	.st-received { background: #E8F8E8; color: #27AE60; }
	.st-cancelled { background: #FDEDEC; color: #E74C3C; }

	.btn-load-more { width: 100%; padding: 12px; margin-top: 12px; background: white; border: 1px solid #E8E8E8; border-radius: 10px; font-size: 13px; color: #0E5A3C; font-weight: 600; cursor: pointer; }

	/* Action bar */
	.action-bar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
	.btn-add { background: #0E5A3C; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-add:active { background: #0A3F2C; }

	/* PO Item Cards (create view) */
	.items-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }

	.po-item-card { background: white; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
	.po-item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
	.po-item-sno { font-size: 12px; font-weight: 700; color: #aaa; min-width: 20px; }
	.po-item-code { font-size: 11px; color: #999; font-family: monospace; flex: 1; }
	.po-item-name { font-size: 14px; font-weight: 700; color: #2B2B2B; margin-bottom: 10px; }
	.po-item-fields { display: flex; gap: 8px; }
	.po-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
	.po-field span { font-size: 11px; font-weight: 600; color: #888; }
	.po-field select, .po-field input { padding: 8px 10px; border: 1px solid #E8E8E8; border-radius: 8px; font-size: 13px; background: #fafafa; width: 100%; box-sizing: border-box; }
	.po-field select:focus, .po-field input:focus { outline: none; border-color: #0E5A3C; background: white; }
	.qty-field { max-width: 130px; }
	.qty-field input { text-align: right; }
	.qty-row { display: flex; gap: 4px; align-items: center; }
	.qty-row input { flex: 1; min-width: 0; -moz-appearance: textfield; }
	.qty-row input::-webkit-inner-spin-button, .qty-row input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
	.btn-plus { width: 36px; height: 36px; background: #0E5A3C; color: white; border: none; border-radius: 8px; font-size: 18px; font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
	.btn-plus:active { background: #0A3F2C; }

	.btn-remove { background: none; border: none; color: #ccc; font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
	.btn-remove:active { color: #e53e3e; background: #fee; }

	/* Notes */
	.notes-section { margin-bottom: 16px; }
	.notes-section textarea { width: 100%; padding: 10px 12px; border: 1px solid #E8E8E8; border-radius: 8px; font-size: 14px; font-family: inherit; resize: none; box-sizing: border-box; background: #fafafa; }
	.notes-section textarea:focus { outline: none; border-color: #0E5A3C; background: white; }

	/* Form Section */
	.form-section { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; }

	.field { display: flex; flex-direction: column; gap: 4px; }
	.field span { font-size: 12px; font-weight: 600; color: #555; }
	.field select { padding: 10px 12px; border: 1px solid #E8E8E8; border-radius: 8px; font-size: 14px; background: #fafafa; width: 100%; box-sizing: border-box; }
	.field select:focus { outline: none; border-color: #0E5A3C; background: white; }

	/* Button */
	.btn-primary { background: #0E5A3C; color: white; border: none; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
	.btn-primary:active { background: #0A3F2C; }
	.btn-primary:disabled { opacity: 0.6; cursor: default; }
	.full-width { width: 100%; }

	/* Detail */
	.detail-card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; }
	.detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
	.detail-row:last-child { border-bottom: none; }
	.detail-row .label { color: #888; font-weight: 500; }
	.mono { font-family: monospace; font-weight: 700; color: #0E5A3C; }

	.section-title { font-size: 14px; font-weight: 700; color: #333; margin: 0 0 10px; }

	.detail-item-card { background: white; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
	.detail-item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
	.di-sno { font-size: 12px; font-weight: 700; color: #aaa; }
	.di-code { font-size: 11px; color: #999; font-family: monospace; }
	.di-name { font-size: 14px; font-weight: 700; color: #2B2B2B; margin-bottom: 4px; }
	.di-meta { display: flex; gap: 16px; font-size: 12px; color: #777; }
	.di-qty { font-weight: 700; color: #0E5A3C; }

	/* Detail Actions */
	.detail-actions { display: flex; gap: 10px; margin-top: 16px; margin-bottom: 12px; }
	.btn-share-wa { flex: 1; padding: 12px; background: #25D366; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
	.btn-share-wa:active { background: #1da851; }
	.btn-copy-text { flex: 1; padding: 12px; background: white; color: #333; border: 1px solid #ddd; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
	.btn-copy-text:active { background: #f5f5f5; }

	/* Share Panel */
	.share-panel { background: #f8fdf8; border: 1px solid #d4edda; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
	.share-panel h4 { margin: 0 0 8px; font-size: 14px; color: #0E5A3C; }
	.share-hint { font-size: 12px; color: #777; margin: 0 0 10px; }
	.share-checkboxes { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; }
	.share-checkboxes label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #333; cursor: pointer; }
	.share-checkboxes input[type="checkbox"] { accent-color: #0E5A3C; width: 18px; height: 18px; }
	.share-preview { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 12px; max-height: 140px; overflow-y: auto; }
	.share-preview pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; color: #333; font-family: inherit; }
	.share-buttons { display: flex; gap: 10px; }
	.btn-wa { flex: 1; padding: 12px; background: #25D366; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-wa:active { background: #1da851; }
	.btn-copy { flex: 1; padding: 12px; background: white; color: #333; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-copy:active { background: #f5f5f5; }

	/* Search Overlay */
	.search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: flex-end; justify-content: center; }
	.search-popup { background: white; border-radius: 16px 16px 0 0; width: 100%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 -4px 30px rgba(0,0,0,0.2); }
	.search-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; }
	.search-popup-header h3 { margin: 0; font-size: 16px; color: #0E5A3C; }
	.btn-close { background: none; border: none; font-size: 18px; color: #aaa; cursor: pointer; padding: 4px 8px; }

	.search-popup-bar { padding: 12px 16px; }
	.search-popup-bar input { width: 100%; padding: 12px 14px; border: 1px solid #ddd; border-radius: 10px; font-size: 15px; box-sizing: border-box; }
	.search-popup-bar input:focus { outline: none; border-color: #0E5A3C; }

	.search-popup-results { flex: 1; overflow-y: auto; padding: 0 8px 16px; }
	.search-hint { text-align: center; padding: 20px; color: #aaa; font-size: 13px; }

	.search-result-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px; border: none; background: none; cursor: pointer; border-radius: 10px; text-align: left; font-size: 14px; }
	.search-result-item:active { background: #f0faf0; }

	.sr-code { font-family: monospace; font-size: 11px; color: #999; min-width: 60px; }
	.sr-name { flex: 1; font-weight: 600; color: #333; }
	.sr-cat { font-size: 11px; color: #888; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; }
</style>
