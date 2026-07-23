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
	type POItem = { product_id: string; product_code: string; product_name: string; selected_unit: string; base_unit_qty: number; quantity: number };
	type Supplier = { id: string; supplier_code: string; supplier_name: string };
	type SavedPO = { id: string; po_number: string; po_type: string; po_date: string; status: string; total_amount: number; notes: string | null; supplier_name: string | null; supplier_code: string | null; items_count: number; created_at: string };
	type PODetailItem = { id: string; product_id: string; product_code: string; product_name: string; unit_name: string; unit_short_code: string; conversion_factor: number; quantity: number };

	let activeTab: 'general' | 'supplier' | 'saved' | 'detail' = $state('saved');
	let allUnits = $state<UnitMaster[]>([]);

	// General tab
	let generalItems = $state<POItem[]>([]);
	let showProductSearch = $state(false);
	let productSearchQuery = $state('');
	let productSearchResults = $state<SearchProduct[]>([]);
	let productSearching = $state(false);
	let generalNotes = $state('');

	// Supplier tab
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

	// Detail view
	let detailPO = $state<any>(null);
	let detailItems = $state<PODetailItem[]>([]);
	let detailLoading = $state(false);

	async function loadAllUnits() {
		const { data } = await supabase.rpc('rpc_list_units_master', { p_active_only: true });
		allUnits = data || [];
	}

	// ============ GENERAL TAB ============

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
		if (isEditingDetail) {
			if (editItems.some(i => i.product_id === prod.id)) {
				toasts.add('Already in PO', 'info');
				return;
			}
			const baseUnit = prod.units?.find((u: any) => u.is_base_unit) || prod.units?.[0];
			editItems = [...editItems, {
				product_id: prod.id,
				product_code: prod.product_code,
				product_name: prod.product_name,
				selected_unit: baseUnit?.unit_name || '',
				base_unit_qty: 1,
				quantity: 1
			}];
			showProductSearch = false;
			productSearchQuery = '';
			productSearchResults = [];
			return;
		}

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
			base_unit_qty: 1,
			quantity: 0
		}];
		showProductSearch = false;
		productSearchQuery = '';
		productSearchResults = [];
	}

	function removeGeneralItem(idx: number) {
		generalItems = generalItems.filter((_, i) => i !== idx);
	}

	// ============ SUPPLIER TAB ============

	async function loadSuppliers() {
		const { data } = await supabase.rpc('rpc_list_suppliers', { p_search: null, p_active_only: true, p_limit: 500, p_offset: 0 });
		suppliers = (data?.data || []).map((s: any) => ({ id: s.id, supplier_code: s.supplier_code, supplier_name: s.supplier_name }));
	}

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
				base_unit_qty: 1,
				quantity: 0
			};
		});
	}

	function removeSupplierItem(idx: number) {
		supplierItems = supplierItems.filter((_, i) => i !== idx);
	}

	// ============ SAVE ============

	async function saveGeneralPO() {
		if (generalItems.length === 0) { toasts.add('Add at least one product', 'error'); return; }
		saving = true;
		const items = generalItems.map(i => {
			const u = allUnits.find(x => x.unit_name === i.selected_unit);
			return { product_id: i.product_id, unit_name: i.selected_unit, unit_short_code: u?.unit_short_code || '', conversion_factor: i.base_unit_qty, quantity: i.quantity, unit_price: 0 };
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
	}

	async function saveSupplierPO() {
		const activeItems = supplierItems.filter(i => i.quantity > 0);
		if (activeItems.length === 0) { toasts.add('Add quantities to at least one product', 'error'); return; }
		saving = true;
		const sup = suppliers.find(s => s.id === selectedSupplierId);
		const items = activeItems.map(i => {
			const u = allUnits.find(x => x.unit_name === i.selected_unit);
			return { product_id: i.product_id, unit_name: i.selected_unit, unit_short_code: u?.unit_short_code || '', conversion_factor: i.base_unit_qty, quantity: i.quantity, unit_price: 0 };
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
	}

	// ============ SAVED POs ============

	async function loadSavedPOs(append = false) {
		if (!append) savedLoading = true;
		const { data, error } = await supabase.rpc('rpc_list_purchase_orders', {
			p_search: savedSearch || null,
			p_status: savedStatusFilter || null,
			p_po_type: null,
			p_limit: 30,
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

	let isEditingDetail = $state(false);
	let editNotes = $state('');
	let editStatus = $state('');
	let editItems = $state<POItem[]>([]);
	let editSaving = $state(false);

	async function viewPODetail(po: SavedPO) {
		detailLoading = true;
		isEditingDetail = false;
		activeTab = 'detail';
		const { data, error } = await supabase.rpc('rpc_get_purchase_order_detail', { p_po_id: po.id });
		detailLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load PO details', 'error'); activeTab = 'saved'; return; }
		detailPO = data.po;
		detailItems = data.items || [];
	}

	function startEditingDetail() {
		if (!detailPO) return;
		editNotes = detailPO.notes || '';
		editStatus = detailPO.status || 'draft';
		editItems = detailItems.map((item: any) => ({
			product_id: item.product_id,
			product_code: item.product_code,
			product_name: item.product_name,
			selected_unit: item.unit_name,
			base_unit_qty: item.conversion_factor || 1,
			quantity: item.quantity
		}));
		isEditingDetail = true;
	}

	function cancelEditingDetail() {
		isEditingDetail = false;
	}

	function removeEditItem(index: number) {
		editItems = editItems.filter((_, i) => i !== index);
	}

	async function saveDetailEdits() {
		if (!detailPO) return;
		if (editItems.length === 0) { toasts.add('PO must have at least 1 item', 'warning'); return; }
		editSaving = true;

		const payloadItems = editItems.map(i => {
			const u = allUnits.find(x => x.unit_name === i.selected_unit);
			return { product_id: i.product_id, unit_name: i.selected_unit, unit_short_code: u?.unit_short_code || '', conversion_factor: i.base_unit_qty, quantity: i.quantity, unit_price: 0 };
		});

		const { data, error } = await supabase.rpc('rpc_update_purchase_order', {
			p_po_id: detailPO.id,
			p_notes: editNotes,
			p_status: editStatus,
			p_items: payloadItems
		});

		editSaving = false;
		if (error || !data?.success) {
			toasts.add('Failed to update PO: ' + (error?.message || data?.message || ''), 'error');
			return;
		}

		toasts.add(`Purchase Order ${detailPO.po_number} updated`, 'success');
		writeAuditLog({ action: 'update', resourceType: 'purchase_order', resourceId: detailPO.id, resourceLabel: detailPO.po_number });
		isEditingDetail = false;
		
		// Reload detail
		const res = await supabase.rpc('rpc_get_purchase_order_detail', { p_po_id: detailPO.id });
		if (res.data?.success) {
			detailPO = res.data.po;
			detailItems = res.data.items || [];
		}
		loadSavedPOs();
	}

	async function deletePO(po: SavedPO, e?: Event) {
		if (e) e.stopPropagation();
		if (!confirm(`Are you sure you want to delete purchase order ${po.po_number}?`)) return;
		const { data, error } = await supabase.rpc('rpc_delete_purchase_order', { p_po_id: po.id });
		if (error || !data?.success) {
			toasts.add('Failed to delete PO: ' + (error?.message || data?.message || ''), 'error');
			return;
		}
		toasts.add(`Purchase Order ${po.po_number} deleted`, 'success');
		writeAuditLog({ action: 'delete', resourceType: 'purchase_order', resourceId: po.id, resourceLabel: po.po_number });
		if (detailPO?.id === po.id) {
			activeTab = 'saved';
			detailPO = null;
			detailItems = [];
		}
		loadSavedPOs();
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

	// ============ SHARE / PRINT ============
	let showSharePanel = $state(false);
	let shareIncludeCode = $state(false);
	let shareIncludeProduct = $state(true);
	let shareIncludeUnitQty = $state(true);
	let shareIncludeUnit = $state(true);
	let shareIncludeQty = $state(true);

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
			if (shareIncludeUnitQty) parts.push(`${item.conversion_factor || 1}`);
			if (shareIncludeUnit) {
				const unitStr = item.unit_short_code ? `${item.unit_name} (${item.unit_short_code})` : item.unit_name;
				parts.push(unitStr);
			}
			if (shareIncludeQty) parts.push(`- Qty: ${item.quantity}`);
			lines.push(parts.join(' '));

			// Total calculation line: (unit qty x order qty) unit short name
			const totalQty = (Number(item.conversion_factor) || 1) * Number(item.quantity || 0);
			const shortName = item.unit_short_code || item.unit_name || '';
			lines.push(`           Total : ${totalQty} ${shortName}`);
			lines.push(''); // Blank line space after total before next item
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

	function printPO() {
		if (!detailPO) return;
		const rows = detailItems.map((item: any, idx: number) => {
			const unitDisplay = item.unit_short_code ? `${item.unit_name} (${item.unit_short_code})` : item.unit_name;
			return `<tr><td>${idx + 1}</td><td>${item.product_code}</td><td>${item.product_name}</td><td style="text-align:center">${item.conversion_factor || 1}</td><td>${unitDisplay}</td><td style="text-align:center">${item.quantity}</td></tr>`;
		}).join('');
		const html = `<!DOCTYPE html><html><head><title>PO ${detailPO.po_number}</title>
		<style>
			@page { size: A4; margin: 20mm; }
			body { font-family: Arial, sans-serif; font-size: 13px; color: #333; }
			h1 { font-size: 20px; color: #0E5A3C; margin-bottom: 4px; }
			.meta { margin-bottom: 16px; font-size: 13px; color: #555; }
			.meta span { margin-right: 24px; }
			table { width: 100%; border-collapse: collapse; margin-top: 12px; }
			th { background: #0E5A3C; color: white; padding: 8px 10px; text-align: left; font-size: 12px; }
			td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
			tr:nth-child(even) { background: #f8f8f5; }
			.notes { margin-top: 16px; padding: 10px; background: #fafafa; border-radius: 6px; font-size: 12px; }
			.footer { margin-top: 30px; font-size: 11px; color: #999; text-align: center; }
		</style></head><body>
		<h1>📋 ${detailPO.po_number}</h1>
		<div class="meta">
			<span>📅 ${formatDate(detailPO.po_date)}</span>
			${detailPO.supplier_name ? `<span>🚚 ${detailPO.supplier_name} (${detailPO.supplier_code})</span>` : ''}
			<span>Status: ${statusLabel(detailPO.status)}</span>
		</div>
		<table><thead><tr><th>#</th><th>Code</th><th>Product</th><th>Unit Qty</th><th>Unit</th><th>Order Qty</th></tr></thead><tbody>${rows}</tbody></table>
		${detailPO.notes ? `<div class="notes"><b>Notes:</b> ${detailPO.notes}</div>` : ''}
		<div class="footer">MBC One OS — Purchase Order</div>
		</body></html>`;
		const w = window.open('', '_blank', 'width=800,height=600');
		if (w) { w.document.write(html); w.document.close(); w.print(); }
	}

	onMount(() => { loadSuppliers(); loadAllUnits(); loadSavedPOs(); });
</script>

<div class="po-window">
	<!-- Tab Bar -->
	<div class="tab-bar">
		{#if permAdd}<button class="tab" class:active={activeTab === 'general'} onclick={() => { activeTab = 'general'; }}>
			📋 General
		</button>{/if}
		{#if permAdd}<button class="tab" class:active={activeTab === 'supplier'} onclick={() => { activeTab = 'supplier'; }}>
			🚚 Supplier
		</button>{/if}
		<button class="tab" class:active={activeTab === 'saved'} onclick={() => { activeTab = 'saved'; loadSavedPOs(); }}>
			📂 Saved POs
		</button>
		{#if activeTab === 'detail'}
			<button class="tab active">
				📄 PO Detail
			</button>
		{/if}
	</div>

	<div class="tab-content">
		{#if activeTab === 'general'}
			<!-- GENERAL PO -->
			<div class="po-section">
				<div class="section-header">
					<h3>📋 General Purchase Order</h3>
					{#if permAdd}
						<button class="btn-add-product" onclick={() => { showProductSearch = true; productSearchQuery = ''; productSearchResults = []; }}>
							+ Add Product
						</button>
					{/if}
				</div>

				{#if generalItems.length === 0}
					<div class="empty-hint">No products added. Click "+ Add Product" to search and add.</div>
				{:else}
					<div class="po-table-wrap">
						<table class="po-table">
							<thead>
								<tr>
									<th class="col-sno">#</th>
									<th class="col-code">Code</th>
									<th class="col-name">Product</th>
									<th class="col-base">Unit Qty</th>
									<th class="col-unit">Unit</th>
									<th class="col-qty">Order Qty</th>
									<th class="col-action"></th>
								</tr>
							</thead>
							<tbody>
								{#each generalItems as item, idx}
									<tr>
										<td class="center">{idx + 1}</td>
										<td class="code">{item.product_code}</td>
										<td class="name">
											<div class="po-item-cell">
												<span class="po-item-line1">{item.product_name}</span>
												<span class="po-item-line2">
													<span class="po-item-uqty">
														<input class="inline-input base-qty" type="number" min="1" step="1" bind:value={item.base_unit_qty} />
														<button class="btn-plus" onclick={() => { item.base_unit_qty = (item.base_unit_qty || 1) + 1; }}>+</button>
													</span>
													<select class="inline-select po-item-unit-sel" bind:value={item.selected_unit}>
														{#each allUnits as u}
															<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
														{/each}
													</select>
												</span>
												<span class="po-item-line3">
													Order Qty:
													<input class="inline-input qty" type="number" min="0" step="any" bind:value={item.quantity} />
													<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
												</span>
											</div>
											<span class="po-desktop-name">{item.product_name}</span>
										</td>
										<td class="hide-mobile">
											<div class="qty-row">
												<input class="inline-input base-qty" type="number" min="1" step="1" bind:value={item.base_unit_qty} />
												<button class="btn-plus" onclick={() => { item.base_unit_qty = (item.base_unit_qty || 1) + 1; }}>+</button>
											</div>
										</td>
										<td class="hide-mobile">
											<select class="inline-select" bind:value={item.selected_unit}>
												{#each allUnits as u}
													<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
												{/each}
											</select>
										</td>
										<td class="hide-mobile">
											<div class="qty-row">
												<input class="inline-input qty" type="number" min="0" step="any" bind:value={item.quantity} />
												<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
											</div>
										</td>
										<td class="center">
											<button class="btn-remove" onclick={() => removeGeneralItem(idx)}>✕</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<div class="po-footer">
						<textarea class="notes-input" bind:value={generalNotes} placeholder="Notes (optional)" rows="2"></textarea>
						{#if permAdd}
							<button class="btn-save" onclick={saveGeneralPO} disabled={saving || generalItems.length === 0}>
								{saving ? '⏳ Saving...' : '💾 Save PO'}
							</button>
						{/if}
					</div>
				{/if}
			</div>

		{:else if activeTab === 'supplier'}
			<!-- SUPPLIER SPECIFIC PO -->
			<div class="po-section supplier-section">
				<div class="supplier-sticky-top">
					<div class="section-header">
						<h3>🚚 Supplier Purchase Order</h3>
					</div>

					<div class="supplier-select-bar">
						<label>Select Supplier:</label>
						<select class="supplier-dropdown" bind:value={selectedSupplierId} onchange={onSupplierSelect}>
							<option value="">— Choose Supplier —</option>
							{#each suppliers as sup}
								<option value={sup.id}>{sup.supplier_name} ({sup.supplier_code})</option>
							{/each}
						</select>
					</div>
				</div>

				{#if loadingSupplierProducts}
					<div class="empty-hint">Loading products...</div>
				{:else if selectedSupplierId && supplierItems.length === 0}
					<div class="empty-hint">No products found for this supplier.</div>
				{:else if supplierItems.length > 0}
					<div class="po-table-wrap">
						<table class="po-table">
							<thead>
								<tr>
									<th class="col-sno">#</th>
									<th class="col-code">Code</th>
									<th class="col-name">Product</th>
									<th class="col-base">Unit Qty</th>
									<th class="col-unit">Unit</th>
									<th class="col-qty">Order Qty</th>
									<th class="col-action"></th>
								</tr>
							</thead>
							<tbody>
								{#each supplierItems as item, idx}
									<tr>
										<td class="center">{idx + 1}</td>
										<td class="code">{item.product_code}</td>
										<td class="name">
											<div class="po-item-cell">
												<span class="po-item-line1">{item.product_name}</span>
												<span class="po-item-line2">
													<span class="po-item-uqty">
														<input class="inline-input base-qty" type="number" min="1" step="1" bind:value={item.base_unit_qty} />
														<button class="btn-plus" onclick={() => { item.base_unit_qty = (item.base_unit_qty || 1) + 1; }}>+</button>
													</span>
													<select class="inline-select po-item-unit-sel" bind:value={item.selected_unit}>
														{#each allUnits as u}
															<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
														{/each}
													</select>
												</span>
												<span class="po-item-line3">
													Order Qty:
													<input class="inline-input qty" type="number" min="0" step="any" bind:value={item.quantity} />
													<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
												</span>
											</div>
											<span class="po-desktop-name">{item.product_name}</span>
										</td>
										<td class="hide-mobile">
											<div class="qty-row">
												<input class="inline-input base-qty" type="number" min="1" step="1" bind:value={item.base_unit_qty} />
												<button class="btn-plus" onclick={() => { item.base_unit_qty = (item.base_unit_qty || 1) + 1; }}>+</button>
											</div>
										</td>
										<td class="hide-mobile">
											<select class="inline-select" bind:value={item.selected_unit}>
												{#each allUnits as u}
													<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
												{/each}
											</select>
										</td>
										<td class="hide-mobile">
											<div class="qty-row">
												<input class="inline-input qty" type="number" min="0" step="any" bind:value={item.quantity} />
												<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
											</div>
										</td>
										<td class="center">
											<button class="btn-remove" onclick={() => removeSupplierItem(idx)}>✕</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<div class="po-footer">
						<textarea class="notes-input" bind:value={supplierNotes} placeholder="Notes (optional)" rows="2"></textarea>
						{#if permAdd}
							<button class="btn-save" onclick={saveSupplierPO} disabled={saving}>
								{saving ? '⏳ Saving...' : '💾 Save PO'}
							</button>
						{/if}
					</div>
				{/if}
			</div>

		{:else if activeTab === 'saved'}
			<!-- SAVED POs LIST -->
			<div class="po-section">
				<div class="section-header">
					<h3>📂 Saved Purchase Orders</h3>
				</div>

				<div class="saved-filters">
					<input type="text" class="saved-search" placeholder="Search PO number or supplier..." bind:value={savedSearch} oninput={onSavedSearchInput} />
					<select class="saved-status-filter" bind:value={savedStatusFilter} onchange={() => loadSavedPOs()}>
						<option value="">All Status</option>
						<option value="draft">Draft</option>
						<option value="submitted">Submitted</option>
						<option value="approved">Approved</option>
						<option value="received">Received</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</div>

				{#if savedLoading}
					<div class="empty-hint">Loading...</div>
				{:else if savedPOs.length === 0}
					<div class="empty-hint">No purchase orders found.</div>
				{:else}
					<div class="po-table-wrap">
						<table class="po-table">
							<thead>
								<tr>
									<th>PO Number</th>
									<th class="hide-mobile">Type</th>
									<th>Supplier</th>
									<th>Date</th>
									<th>Items</th>
									<th class="hide-mobile">Status</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody>
								{#each savedPOs as po}
									<tr class="clickable-row" onclick={() => viewPODetail(po)}>
										<td class="code-bold">{po.po_number}</td>
										<td class="hide-mobile"><span class="type-tag">{po.po_type === 'general' ? '📋 General' : '🚚 Supplier'}</span></td>
										<td>{po.supplier_name || '—'}</td>
										<td>{formatDate(po.po_date)}</td>
										<td class="center">{po.items_count}</td>
										<td class="hide-mobile"><span class="status-badge {statusClass(po.status)}">{statusLabel(po.status)}</span></td>
										<td class="action-cell">
											<button class="btn-view" onclick={(e) => { e.stopPropagation(); viewPODetail(po); }}>👁️ View</button>
											<button class="btn-delete" onclick={(e) => deletePO(po, e)}>🗑️ Delete</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if savedPOs.length < savedTotal}
						<button class="btn-load-more" onclick={() => loadSavedPOs(true)}>Load More ({savedPOs.length}/{savedTotal})</button>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'detail'}
			<!-- PO DETAIL -->
			<div class="po-section">
				{#if detailLoading}
					<div class="empty-hint">Loading details...</div>
				{:else if detailPO}
					<div class="detail-header">
						<button class="btn-back" onclick={() => { activeTab = 'saved'; isEditingDetail = false; }}>← Back to list</button>
						<h3>{detailPO.po_number}</h3>
						{#if !isEditingDetail}
							<span class="status-badge {statusClass(detailPO.status)}">{statusLabel(detailPO.status)}</span>
						{/if}
						<div class="detail-header-actions">
							{#if !isEditingDetail}
								<button class="btn-edit" onclick={startEditingDetail}>✏️ Edit PO</button>
								<button class="btn-delete" onclick={() => deletePO(detailPO)}>🗑️ Delete PO</button>
							{:else}
								<button class="btn-save-sm" onclick={saveDetailEdits} disabled={editSaving}>
									{editSaving ? 'Saving...' : '💾 Save Changes'}
								</button>
								<button class="btn-cancel-sm" onclick={cancelEditingDetail} disabled={editSaving}>Cancel</button>
							{/if}
						</div>
					</div>

					{#if !isEditingDetail}
						<div class="detail-info-grid">
							<div class="info-item"><span class="info-label">Type</span><span>{detailPO.po_type === 'general' ? '📋 General' : '🚚 Supplier'}</span></div>
							<div class="info-item"><span class="info-label">Date</span><span>{formatDate(detailPO.po_date)}</span></div>
							{#if detailPO.supplier_name}
								<div class="info-item"><span class="info-label">Supplier</span><span>{detailPO.supplier_name} ({detailPO.supplier_code})</span></div>
							{/if}
							{#if detailPO.notes}
								<div class="info-item full"><span class="info-label">Notes</span><span>{detailPO.notes}</span></div>
							{/if}
							<div class="info-item"><span class="info-label">Created</span><span>{formatDate(detailPO.created_at)}</span></div>
						</div>

						<h4 class="detail-items-title">📦 Items ({detailItems.length})</h4>
						<div class="po-table-wrap">
							<table class="po-table">
								<thead>
									<tr>
										<th class="col-sno">#</th>
										<th class="col-code">Code</th>
										<th class="col-name">Product</th>
										<th class="col-base">Unit Qty</th>
										<th class="col-unit">Unit</th>
										<th class="col-qty">Order Qty</th>
									</tr>
								</thead>
								<tbody>
									{#each detailItems as item, idx}
										<tr>
											<td class="center">{idx + 1}</td>
											<td class="code">{item.product_code}</td>
											<td class="name">
												<div class="po-item-cell">
													<span class="po-item-line1">{item.product_name}</span>
													<span class="po-item-line2">{item.conversion_factor || 1} {item.unit_name}{#if item.unit_short_code} ({item.unit_short_code}){/if}</span>
													<span class="po-item-line3">Order Qty: {item.quantity}</span>
												</div>
												<span class="po-desktop-name">{item.product_name}</span>
											</td>
											<td class="center qty-val hide-mobile">{item.conversion_factor || 1}</td>
											<td class="hide-mobile">{item.unit_name}{#if item.unit_short_code} ({item.unit_short_code}){/if}</td>
											<td class="center qty-val hide-mobile">{item.quantity}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<!-- ACTION BUTTONS -->
						<div class="detail-actions">
							<button class="btn-print" onclick={printPO}>🖨️ Print A4</button>
							<button class="btn-share" onclick={() => { showSharePanel = !showSharePanel; }}>📤 Share to WhatsApp</button>
						</div>

						<!-- SHARE PANEL -->
						{#if showSharePanel}
							<div class="share-panel">
								<h4>📤 Share Options</h4>
								<p class="share-hint">Select fields to include:</p>
								<div class="share-checkboxes">
									<label><input type="checkbox" bind:checked={shareIncludeCode} /> Product Code</label>
									<label><input type="checkbox" bind:checked={shareIncludeProduct} /> Product Name</label>
									<label><input type="checkbox" bind:checked={shareIncludeUnitQty} /> Unit Qty</label>
									<label><input type="checkbox" bind:checked={shareIncludeUnit} /> Unit</label>
									<label><input type="checkbox" bind:checked={shareIncludeQty} /> Quantity</label>
								</div>
								<div class="share-preview">
									<pre>{buildShareText()}</pre>
								</div>
								<div class="share-buttons">
									<button class="btn-wa" onclick={shareToWhatsApp}>
										💬 {detailPO.supplier_phone ? 'Send to Supplier WhatsApp' : 'Open WhatsApp'}
									</button>
									<button class="btn-copy" onclick={copyShareText}>📋 Copy as Text</button>
								</div>
							</div>
						{/if}
					{:else}
						<!-- EDIT MODE FORM -->
						<div class="edit-po-box">
							<div class="edit-fields-row">
								<div class="field-group">
									<label for="po-status-sel">PO Status:</label>
									<select id="po-status-sel" class="inline-select" bind:value={editStatus}>
										<option value="draft">Draft</option>
										<option value="submitted">Submitted</option>
										<option value="approved">Approved</option>
										<option value="received">Received</option>
										<option value="cancelled">Cancelled</option>
									</select>
								</div>
								<div class="field-group flex-1">
									<label for="po-notes-input">Notes:</label>
									<input id="po-notes-input" type="text" class="saved-search" placeholder="Add notes..." bind:value={editNotes} />
								</div>
							</div>

							<div class="edit-items-header">
								<h4>Items in PO ({editItems.length})</h4>
								<button class="btn-add-product" onclick={() => { showProductSearch = true; }}>+ Add Product</button>
							</div>

							<div class="po-table-wrap">
								<table class="po-table">
									<thead>
										<tr>
											<th class="col-sno">#</th>
											<th class="col-code">Code</th>
											<th class="col-name">Product</th>
											<th class="col-base">Unit Qty</th>
											<th class="col-unit">Unit</th>
											<th class="col-qty">Order Qty</th>
											<th class="col-action"></th>
										</tr>
									</thead>
									<tbody>
										{#each editItems as item, idx}
											<tr>
												<td class="center">{idx + 1}</td>
												<td class="code">{item.product_code}</td>
												<td class="name">
													<div class="po-item-cell">
														<span class="po-item-line1">{item.product_name}</span>
														<span class="po-item-line2">
															<span class="po-item-uqty">
																<input class="inline-input base-qty" type="number" min="1" step="1" bind:value={item.base_unit_qty} />
																<button class="btn-plus" onclick={() => { item.base_unit_qty = (item.base_unit_qty || 1) + 1; }}>+</button>
															</span>
															<select class="inline-select po-item-unit-sel" bind:value={item.selected_unit}>
																{#each allUnits as u}
																	<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
																{/each}
															</select>
														</span>
														<span class="po-item-line3">
															Order Qty:
															<input class="inline-input qty" type="number" min="0" step="any" bind:value={item.quantity} />
															<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
														</span>
													</div>
													<span class="po-desktop-name">{item.product_name}</span>
												</td>
												<td class="hide-mobile">
													<div class="qty-row">
														<input class="inline-input base-qty" type="number" min="1" step="1" bind:value={item.base_unit_qty} />
														<button class="btn-plus" onclick={() => { item.base_unit_qty = (item.base_unit_qty || 1) + 1; }}>+</button>
													</div>
												</td>
												<td class="hide-mobile">
													<select class="inline-select" bind:value={item.selected_unit}>
														{#each allUnits as u}
															<option value={u.unit_name}>{u.unit_name} ({u.unit_short_code})</option>
														{/each}
													</select>
												</td>
												<td class="hide-mobile">
													<div class="qty-row">
														<input class="inline-input qty" type="number" min="0" step="any" bind:value={item.quantity} />
														<button class="btn-plus" onclick={() => { item.quantity = (item.quantity || 0) + 1; }}>+</button>
													</div>
												</td>
												<td class="center">
													<button class="btn-remove" onclick={() => removeEditItem(idx)}>✕</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Product Search Popup -->
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
							<span class="sr-unit">{prod.units?.[0]?.unit_name || '—'}</span>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.po-window { height: 100%; display: flex; flex-direction: column; background: #F8F8F5; }

	.tab-bar { display: flex; background: white; border-bottom: 1px solid #E8E8E8; flex-shrink: 0; }
	.tab { flex: 1; padding: 14px 16px; border: none; background: none; font-size: 13px; font-weight: 600; color: #888; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
	.tab:hover { color: #555; background: #fafafa; }
	.tab.active { color: #0E5A3C; border-bottom-color: #0E5A3C; }

	.tab-content { flex: 1; overflow-y: auto; padding: 20px; }

	.po-section { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: visible; }

	.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
	.section-header h3 { margin: 0; font-size: 16px; color: #0E5A3C; font-weight: 700; }

	.btn-add-product { background: #0E5A3C; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
	.btn-add-product:hover { background: #0A3F2C; }

	.empty-hint { text-align: center; padding: 40px 20px; color: #aaa; font-size: 14px; }

	/* Supplier select */
	.supplier-select-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: #fafafa; border-radius: 8px; border: 1px solid #eee; }
	.supplier-select-bar label { font-size: 13px; font-weight: 600; color: #555; white-space: nowrap; }

	/* Sticky top for supplier section */
	.supplier-section { padding-top: 0; }
	.supplier-sticky-top { position: sticky; top: -20px; z-index: 10; background: white; padding: 20px 0 0; margin: 0 0 4px; }
	.supplier-dropdown { flex: 1; padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; background: white; }
	.supplier-dropdown:focus { outline: none; border-color: #0E5A3C; }

	/* PO Table */
	.po-table-wrap { border-radius: 8px; border: 1px solid #eee; max-height: calc(100vh - 300px); overflow-y: auto; }
	.po-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
	.po-table thead { background: #0E5A3C; color: white; }
	.po-table th { padding: 10px 8px; text-align: left; font-weight: 600; font-size: 12px; white-space: nowrap; position: sticky; top: 0; z-index: 5; background: #0E5A3C; }
	.po-table td { padding: 8px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
	.po-table tbody tr:hover { background: #f8fdf8; }

	.col-sno { width: 36px; text-align: center; }
	.col-code { width: 100px; }
	.col-name { min-width: 180px; }

	/* Mobile card layout - hidden on desktop */
	.po-item-cell { display: none; }
	.po-item-line1 { display: none; }
	.po-item-line2 { display: none; }
	.po-item-line3 { display: none; }
	.po-item-uqty { display: none; }
	.po-desktop-name { display: inline; }
	.col-unit { width: 160px; }
	.col-qty { width: 90px; }
	.col-base { width: 70px; }
	.col-action { width: 36px; }

	.center { text-align: center; }
	.code { font-family: monospace; font-size: 11px; color: #888; }
	.name { font-weight: 600; color: #333; }

	.inline-select { padding: 5px 6px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; background: #fafafa; width: 100%; }
	.inline-select:focus { outline: none; border-color: #0E5A3C; }

	.inline-input { padding: 5px 6px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; background: #fafafa; text-align: right; }
	.inline-input:focus { outline: none; border-color: #0E5A3C; background: white; }
	.inline-input.qty { width: 75px; }
	.inline-input.base-qty { width: 55px; }
	.qty-row { display: flex; gap: 4px; align-items: center; }
	.qty-row input { flex: 1; min-width: 0; -moz-appearance: textfield; }
	.qty-row input::-webkit-inner-spin-button, .qty-row input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
	.btn-plus { width: 28px; height: 28px; background: #0E5A3C; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
	.btn-plus:hover { background: #0A3F2C; }

	.btn-remove { background: none; border: none; color: #ccc; font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
	.btn-remove:hover { color: #e53e3e; background: #fee; }

	/* Footer */
	.po-footer { display: flex; gap: 16px; align-items: flex-end; margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; }
	.notes-input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; resize: none; font-family: inherit; }
	.notes-input:focus { outline: none; border-color: #0E5A3C; }
	.btn-save { background: #0E5A3C; color: white; border: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background 0.2s; }
	.btn-save:hover { background: #0A3F2C; }
	.btn-save:disabled { opacity: 0.5; cursor: default; }

	/* Search Popup */
	.search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
	.search-popup { background: white; border-radius: 14px; width: 520px; max-height: 70vh; display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.2); }
	.search-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; }
	.search-popup-header h3 { margin: 0; font-size: 16px; color: #0E5A3C; }
	.btn-close { background: none; border: none; font-size: 18px; color: #aaa; cursor: pointer; padding: 4px 8px; }
	.btn-close:hover { color: #333; }

	.search-popup-bar { padding: 12px 20px; }
	.search-popup-bar input { width: 100%; padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
	.search-popup-bar input:focus { outline: none; border-color: #0E5A3C; }

	.search-popup-results { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
	.search-hint { text-align: center; padding: 20px; color: #aaa; font-size: 13px; }

	.search-result-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: none; background: none; cursor: pointer; border-radius: 8px; text-align: left; transition: background 0.15s; font-size: 13px; }
	.search-result-item:hover { background: #f0faf0; }

	.sr-code { font-family: monospace; font-size: 11px; color: #999; min-width: 80px; }
	.sr-name { flex: 1; font-weight: 600; color: #333; }
	.sr-cat { font-size: 11px; color: #888; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; }
	.sr-unit { font-size: 11px; color: #0E5A3C; font-weight: 600; }

	/* Saved POs */
	.saved-filters { display: flex; gap: 10px; margin-bottom: 16px; }
	.saved-search { flex: 1; padding: 9px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; }
	.saved-search:focus { outline: none; border-color: #0E5A3C; }
	.saved-status-filter { padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; background: white; }

	.clickable-row { cursor: pointer; }
	.clickable-row:hover { background: #f0faf0 !important; }
	.code-bold { font-family: monospace; font-weight: 700; color: #0E5A3C; font-size: 12px; }
	.type-tag { font-size: 12px; }

	.status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 6px; }
	.st-draft { background: #f0f0f0; color: #888; }
	.st-submitted { background: #EBF5FB; color: #2980B9; }
	.st-approved { background: #E8F8F5; color: #1ABC9C; }
	.st-partial { background: #FEF5E7; color: #E67E22; }
	.st-received { background: #E8F8E8; color: #27AE60; }
	.st-cancelled { background: #FDEDEC; color: #E74C3C; }

	.btn-view { background: none; border: 1px solid #E8E8E8; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; color: #555; }
	.btn-view:hover { background: #f0f0f0; }

	.action-cell { display: flex; gap: 6px; align-items: center; }
	.btn-delete { background: #FFF5F5; border: 1px solid #FED7D7; color: #E53E3E; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 500; }
	.btn-delete:hover { background: #FED7D7; }

	.btn-load-more { width: 100%; padding: 10px; margin-top: 12px; background: white; border: 1px solid #E8E8E8; border-radius: 8px; font-size: 13px; color: #0E5A3C; font-weight: 600; cursor: pointer; }

	/* Detail */
	.detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
	.detail-header h3 { margin: 0; font-size: 18px; color: #0E5A3C; font-weight: 700; }
	.detail-header-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
	.btn-edit { background: #EBF5FB; border: 1px solid #AED6F1; color: #2980B9; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600; }
	.btn-edit:hover { background: #D4E6F1; }
	.btn-save-sm { background: #0E5A3C; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
	.btn-save-sm:hover { background: #0A3F2C; }
	.btn-cancel-sm { background: #f0f0f0; color: #555; border: 1px solid #ddd; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
	.btn-cancel-sm:hover { background: #e0e0e0; }

	.edit-po-box { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
	.edit-fields-row { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
	.field-group { display: flex; align-items: center; gap: 8px; }
	.field-group.flex-1 { flex: 1; }
	.field-group label { font-size: 13px; font-weight: 600; color: #555; white-space: nowrap; }
	.edit-items-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
	.edit-items-header h4 { margin: 0; font-size: 14px; color: #0E5A3C; font-weight: 700; }
	.btn-back { background: none; border: none; font-size: 13px; color: #0E5A3C; font-weight: 600; cursor: pointer; padding: 4px 0; }
	.btn-back:hover { text-decoration: underline; }

	.detail-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; padding: 16px; background: #fafafa; border-radius: 10px; border: 1px solid #eee; }
	.info-item { display: flex; flex-direction: column; gap: 2px; }
	.info-item.full { grid-column: 1 / -1; }
	.info-label { font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
	.info-item span:last-child { font-size: 14px; color: #333; font-weight: 500; }

	.detail-items-title { font-size: 14px; font-weight: 700; color: #333; margin: 0 0 10px; }
	.qty-val { font-weight: 700; color: #0E5A3C; }

	/* Detail action buttons */
	.detail-actions { display: flex; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; }
	.btn-print { padding: 10px 20px; background: #0E5A3C; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
	.btn-print:hover { background: #0A3F2C; }
	.btn-share { padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
	.btn-share:hover { background: #1da851; }

	/* Share panel */
	.share-panel { margin-top: 16px; padding: 16px; background: #f8fdf8; border: 1px solid #d4edda; border-radius: 10px; }
	.share-panel h4 { margin: 0 0 8px; font-size: 14px; color: #0E5A3C; }
	.share-hint { font-size: 12px; color: #777; margin: 0 0 10px; }
	.share-checkboxes { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; }
	.share-checkboxes label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #333; cursor: pointer; }
	.share-checkboxes input[type="checkbox"] { accent-color: #0E5A3C; width: 16px; height: 16px; }
	.share-preview { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 12px; max-height: 160px; overflow-y: auto; }
	.share-preview pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; color: #333; font-family: inherit; }
	/* Mobile Responsive Styles */
	@media (max-width: 768px) {
		.po-window {
			min-height: auto;
		}

		.tab-bar {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.tab {
			padding: 10px 12px;
			font-size: 12px;
			white-space: nowrap;
		}

		.tab-content {
			padding: 4px;
		}

		.po-section {
			padding: 6px;
			border-radius: 8px;
		}

		.section-header {
			flex-wrap: wrap;
			gap: 8px;
		}

		.supplier-select-bar {
			flex-direction: column;
			align-items: stretch;
			gap: 8px;
		}

		.supplier-sticky-top {
			top: -10px;
			padding: 10px 0 0;
		}

		/* Saved PO search filters on mobile */
		.saved-filters {
			flex-direction: column;
			gap: 8px;
		}

		.saved-search, .saved-status-filter {
			width: 100%;
			box-sizing: border-box;
		}

		/* Tables horizontal scrolling on mobile */
		.po-table-wrap {
			max-height: calc(100vh - 280px);
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.po-table {
			width: 100%;
			table-layout: auto;
		}

		.po-table th, .po-table td {
			padding: 6px 4px;
			font-size: 12px;
		}

		.col-code { display: none; } /* Hide code column header on mobile */
		.po-table td.code { display: none; } /* Hide code column cells on mobile */
		.col-base, .col-unit, .col-qty { display: none; } /* Hide Unit Qty, Unit, Order Qty headers */
		.hide-mobile { display: none !important; }

		/* Mobile stacked card inside Name cell */
		.po-item-cell {
			display: flex !important;
			flex-direction: column;
			gap: 6px;
		}

		.po-item-line1 {
			display: block !important;
			font-weight: 600;
			font-size: 13px;
			color: #333;
		}

		.po-item-line2 {
			display: flex !important;
			gap: 6px;
			align-items: center;
			flex-wrap: wrap;
		}

		.po-item-uqty {
			display: inline-flex !important;
			gap: 3px;
			align-items: center;
		}

		.po-item-unit-sel {
			flex: 1;
			min-width: 100px;
		}

		.po-item-line3 {
			display: flex !important;
			gap: 6px;
			align-items: center;
			font-size: 12px;
			font-weight: 600;
			color: #0E5A3C;
		}

		/* Hide the plain product name text shown on desktop */
		.po-desktop-name {
			display: none !important;
		}

		.col-name {
			min-width: auto;
		}

		.inline-input.qty { width: 55px; }
		.inline-input.base-qty { width: 45px; }
		.inline-select { font-size: 11px; padding: 4px; }

		.qty-row { gap: 2px; }
		.btn-plus { width: 24px; height: 24px; font-size: 14px; }

		/* Footer */
		.po-footer {
			position: sticky;
			bottom: 0;
			background: white;
			flex-direction: column;
			align-items: stretch;
			gap: 10px;
			padding: 12px 4px;
			margin: 0 -4px;
			box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
			z-index: 10;
		}

		.btn-save {
			width: 100%;
			padding: 12px;
		}

		/* Search Popup Modal */
		.search-popup {
			width: 95vw;
			max-height: 85vh;
			margin: 10px;
		}

		.edit-fields-row {
			flex-direction: column;
			align-items: stretch;
			gap: 10px;
		}

		.detail-info-grid {
			grid-template-columns: 1fr;
			gap: 8px;
			padding: 12px;
		}

		.detail-header {
			flex-wrap: wrap;
			gap: 8px;
		}

		.detail-header-actions {
			margin-left: 0;
			width: 100%;
			justify-content: flex-end;
		}

		.share-checkboxes {
			gap: 10px;
		}

		.share-buttons {
			flex-direction: column;
		}

		.share-buttons button {
			width: 100%;
		}
	}
</style>
