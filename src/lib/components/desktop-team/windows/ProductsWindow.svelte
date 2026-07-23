<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog, diffChanges } from '$lib/utils/audit';
	import ImageSearchModal from '$lib/components/common/ImageSearchModal.svelte';

	const RESOURCE_KEY = 'inventory.manage.production';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	let permDelete = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
		permDelete = isSA || (r?.can_delete ?? false);
	});

	type Category = { id: string; category_code: string; category_name: string; };
	type ProductRow = {
		id: string; product_code: string; product_name: string; product_type: string;
		category_name: string | null; hsn_code: string | null; gst_percentage: number;
		base_unit: string | null; units_count: number; variants_count: number;
		barcodes_count: number; is_active: boolean; created_at: string;
	};
	type VariantRow = { variant_type: string; variant_value: string; price_adjustment: number; sku_suffix: string; image_url: string; };
	type AdditionalUnit = {
		unit_name: string; unit_short_code: string; conversion_factor: number;
		purchase_price: number; selling_price: number; mrp: number;
		barcode: string; barcode_type: string;
		variants: VariantRow[];
		image_url: string;
	};

	let activeTab: 'create' | 'manage' = $state('create');

	// Categories
	let categories = $state<Category[]>([]);
	let categoriesLoaded = $state(false);
	async function loadCategories() {
		if (categoriesLoaded) return;
		const { data } = await supabase.rpc('rpc_list_product_categories', { p_active_only: true });
		categories = data || [];
		categoriesLoaded = true;
	}
	loadCategories();

	// Units Master
	type UnitMaster = { id: string; unit_name: string; unit_short_code: string; };
	let unitsMaster = $state<UnitMaster[]>([]);
	let unitsLoaded = $state(false);
	async function loadUnits() {
		if (unitsLoaded) return;
		const { data } = await supabase.rpc('rpc_list_units_master', { p_active_only: true });
		unitsMaster = data || [];
		unitsLoaded = true;
	}
	loadUnits();

	// Add Unit Modal
	let showAddUnitModal = $state(false);
	let newUnitName = $state('');
	let newUnitCode = $state('');
	let addUnitLoading = $state(false);
	let addUnitCallback: ((unit: UnitMaster) => void) | null = $state(null);

	function openAddUnitModal(callback?: (unit: UnitMaster) => void) {
		newUnitName = '';
		newUnitCode = '';
		addUnitCallback = callback || null;
		showAddUnitModal = true;
	}

	async function handleAddUnit() {
		if (!newUnitName.trim() || !newUnitCode.trim()) { toasts.add('Both fields are required', 'error'); return; }
		addUnitLoading = true;
		const { data, error } = await supabase.rpc('rpc_add_unit_master', { p_unit_name: newUnitName.trim(), p_unit_short_code: newUnitCode.trim() });
		addUnitLoading = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
		const newUnit = { id: data.id, unit_name: data.unit_name, unit_short_code: data.unit_short_code };
		unitsMaster = [...unitsMaster, newUnit].sort((a, b) => a.unit_name.localeCompare(b.unit_name));
		toasts.add('Unit "' + data.unit_name + '" added!', 'success');
		if (addUnitCallback) addUnitCallback(newUnit);
		showAddUnitModal = false;
	}

	// ==================== CREATE FORM ====================
	let createForm = $state({
		product_name: '',
		category_id: '',
		product_type: 'raw_material' as string,
		hsn_code: '',
		gst_percentage: 0,
		description: '',
		default_supplier_id: '',
		// Base unit (factor always 1)
		base_unit_name: '',
		base_unit_code: '',
		base_purchase_price: 0,
		base_selling_price: 0,
		base_mrp: 0,
		base_barcode: '',
		base_barcode_type: 'internal' as string,
		// Stock
		min_stock: 0,
		max_stock: 0,
		reorder_level: 0
	});

	// Supplier search
	type SupplierOption = { id: string; supplier_code: string; supplier_name: string; contact_person: string | null; phone: string | null; };
	let supplierResults = $state<SupplierOption[]>([]);
	let supplierSearch = $state('');
	let supplierSearching = $state(false);
	let selectedSupplierName = $state('');
	let showSupplierDropdown = $state(false);

	async function searchSuppliers() {
		if (supplierSearch.length < 1) { supplierResults = []; return; }
		supplierSearching = true;
		const { data } = await supabase.rpc('rpc_search_suppliers', { p_search: supplierSearch });
		supplierResults = data || [];
		supplierSearching = false;
		showSupplierDropdown = true;
	}

	function selectSupplier(s: SupplierOption) {
		createForm.default_supplier_id = s.id;
		selectedSupplierName = s.supplier_name + ' (' + s.supplier_code + ')';
		supplierSearch = '';
		showSupplierDropdown = false;
		supplierResults = [];
	}

	function clearSupplier() {
		createForm.default_supplier_id = '';
		selectedSupplierName = '';
	}

	function onBaseUnitSelect(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const u = unitsMaster.find(m => m.id === val);
		if (u) { createForm.base_unit_name = u.unit_name; createForm.base_unit_code = u.unit_short_code; }
	}

	function onAdditionalUnitSelect(e: Event, idx: number) {
		const val = (e.target as HTMLSelectElement).value;
		const u = unitsMaster.find(m => m.id === val);
		if (u) { additionalUnits[idx].unit_name = u.unit_name; additionalUnits[idx].unit_short_code = u.unit_short_code; additionalUnits = [...additionalUnits]; }
	}

	// Base unit variants
	let baseVariants = $state<VariantRow[]>([]);
	// Additional units (each can have its own variants)
	let additionalUnits = $state<AdditionalUnit[]>([]);
	let createLoading = $state(false);

	// Images
	let baseUnitImage = $state('');
	let baseUnitImageUploading = $state(false);

	async function uploadImage(file: File, label: string): Promise<string> {
		const ext = file.name.split('.').pop() || 'jpg';
		const path = `${crypto.randomUUID()}.${ext}`;
		const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type });
		if (error) throw new Error(error.message);
		const { data } = supabase.storage.from('product-images').getPublicUrl(path);
		return data.publicUrl;
	}

	async function handleBaseImageUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		baseUnitImageUploading = true;
		try {
			baseUnitImage = await uploadImage(file, 'base');
			toasts.add('Image uploaded', 'success');
		} catch (err: any) {
			toasts.add('Upload failed: ' + err.message, 'error');
		}
		baseUnitImageUploading = false;
		input.value = '';
	}

	async function handleAdditionalUnitImageUpload(e: Event, idx: number) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			additionalUnits[idx].image_url = await uploadImage(file, 'unit-' + idx);
			additionalUnits = [...additionalUnits];
			toasts.add('Image uploaded', 'success');
		} catch (err: any) {
			toasts.add('Upload failed: ' + err.message, 'error');
		}
		input.value = '';
	}

	async function handleVariantImageUpload(e: Event, variant: VariantRow, updateFn: () => void) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			variant.image_url = await uploadImage(file, 'variant');
			updateFn();
			toasts.add('Variant image uploaded', 'success');
		} catch (err: any) {
			toasts.add('Upload failed: ' + err.message, 'error');
		}
		input.value = '';
	}

	// Image search modal
	let showImageSearch = $state(false);
	let imageSearchQuery = $state('');
	let imageSearchCallback: ((url: string) => void) | null = $state(null);

	function openImageSearch(callback: (url: string) => void) {
		imageSearchCallback = callback;
		imageSearchQuery = createForm.product_name.trim();
		showImageSearch = true;
	}

	function handleImageSearchSelect(url: string) {
		if (imageSearchCallback) imageSearchCallback(url);
		imageSearchCallback = null;
	}

	function addBaseVariant() {
		baseVariants = [...baseVariants, { variant_type: '', variant_value: '', price_adjustment: 0, sku_suffix: '', image_url: '' }];
	}
	function removeBaseVariant(i: number) { baseVariants = baseVariants.filter((_, idx) => idx !== i); }

	function addAdditionalUnit() {
		additionalUnits = [...additionalUnits, {
			unit_name: '', unit_short_code: '', conversion_factor: 1,
			purchase_price: 0, selling_price: 0, mrp: 0,
			barcode: '', barcode_type: 'internal', variants: [],
			image_url: ''
		}];
	}
	function removeAdditionalUnit(i: number) { additionalUnits = additionalUnits.filter((_, idx) => idx !== i); }

	function addUnitVariant(unitIdx: number) {
		additionalUnits[unitIdx].variants = [...additionalUnits[unitIdx].variants, { variant_type: '', variant_value: '', price_adjustment: 0, sku_suffix: '', image_url: '' }];
		additionalUnits = [...additionalUnits];
	}
	function removeUnitVariant(unitIdx: number, varIdx: number) {
		additionalUnits[unitIdx].variants = additionalUnits[unitIdx].variants.filter((_, idx) => idx !== varIdx);
		additionalUnits = [...additionalUnits];
	}

	async function handleCreate() {
		if (!createForm.product_name.trim()) { toasts.add('Product name is required', 'error'); return; }
		if (!createForm.base_unit_name.trim() || !createForm.base_unit_code.trim()) { toasts.add('Base unit name and code are required', 'error'); return; }

		// Build units array
		const units: any[] = [{
			unit_name: createForm.base_unit_name.trim(),
			unit_short_code: createForm.base_unit_code.trim(),
			conversion_factor: 1,
			purchase_price: createForm.base_purchase_price || 0,
			selling_price: createForm.base_selling_price || 0,
			mrp: createForm.base_mrp || 0,
			is_base_unit: true, is_purchase_unit: true, is_sales_unit: true
		}];

		for (const au of additionalUnits) {
			if (!au.unit_name.trim() || !au.unit_short_code.trim()) continue;
			units.push({
				unit_name: au.unit_name.trim(),
				unit_short_code: au.unit_short_code.trim(),
				conversion_factor: au.conversion_factor || 1,
				purchase_price: au.purchase_price || 0,
				selling_price: au.selling_price || 0,
				mrp: au.mrp || 0,
				is_base_unit: false, is_purchase_unit: true, is_sales_unit: false
			});
		}

		// Build barcodes
		const barcodes: any[] = [];
		if (createForm.base_barcode.trim()) {
			barcodes.push({ barcode: createForm.base_barcode.trim(), barcode_type: createForm.base_barcode_type, unit_short_code: createForm.base_unit_code.trim() });
		}
		for (const au of additionalUnits) {
			if (au.barcode.trim() && au.unit_short_code.trim()) {
				barcodes.push({ barcode: au.barcode.trim(), barcode_type: au.barcode_type, unit_short_code: au.unit_short_code.trim() });
			}
		}

		// Build variants (base variants + unit variants tagged by type)
		const variants: any[] = [];
		for (const v of baseVariants) {
			if (v.variant_type.trim() && v.variant_value.trim()) variants.push(v);
		}
		for (const au of additionalUnits) {
			for (const v of au.variants) {
				if (v.variant_type.trim() && v.variant_value.trim()) variants.push(v);
			}
		}

		createLoading = true;

		let resultProductId: string;
		if (isEditMode) {
			// UPDATE existing product
			const { data, error } = await supabase.rpc('rpc_update_product_full', {
				p_product_id: editProductId,
				p_product_name: createForm.product_name.trim(),
				p_category_id: createForm.category_id || null,
				p_product_type: createForm.product_type,
				p_hsn_code: createForm.hsn_code.trim() || null,
				p_gst_percentage: createForm.gst_percentage || 0,
				p_description: createForm.description.trim() || null,
				p_default_supplier_id: createForm.default_supplier_id || null,
				p_min_stock: createForm.min_stock || 0,
				p_max_stock: createForm.max_stock || 0,
				p_reorder_level: createForm.reorder_level || 0,
				p_is_active: true,
				p_units: units,
				p_barcodes: barcodes,
				p_variants: variants
			});
			createLoading = false;
			if (error) { toasts.add('Update failed: ' + error.message, 'error'); return; }
			if (!data?.success) { toasts.add(data?.message || 'Update failed', 'error'); return; }
			toasts.add('Product updated! ' + editProductCode, 'success');
			const editOriginal = editFormOriginalJson ? JSON.parse(editFormOriginalJson) : {};
			const editCurrent = { product_name: createForm.product_name, category_id: createForm.category_id, product_type: createForm.product_type, hsn_code: createForm.hsn_code, gst_percentage: createForm.gst_percentage, description: createForm.description, default_supplier_id: createForm.default_supplier_id, base_unit_name: createForm.base_unit_name, base_purchase_price: createForm.base_purchase_price, base_selling_price: createForm.base_selling_price, base_mrp: createForm.base_mrp, min_stock: createForm.min_stock, max_stock: createForm.max_stock, reorder_level: createForm.reorder_level };
			const editChanges = diffChanges(editOriginal, editCurrent);
			writeAuditLog({ action: 'update', resourceType: 'product', resourceId: editProductId, resourceLabel: createForm.product_name.trim(), changes: editChanges });
			resultProductId = editProductId;
		} else {
			// CREATE new product
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
				p_units: JSON.stringify(units),
				p_barcodes: JSON.stringify(barcodes),
				p_variants: JSON.stringify(variants),
				p_default_supplier_id: createForm.default_supplier_id || null
			});
			createLoading = false;
			if (error) { toasts.add('Create failed: ' + error.message, 'error'); return; }
			if (!data?.success) { toasts.add(data?.message || 'Create failed', 'error'); return; }
			toasts.add('Product created! Code: ' + data.product_code, 'success');
			writeAuditLog({ action: 'create', resourceType: 'product', resourceId: data.product_id, resourceLabel: createForm.product_name.trim(), details: { product_code: data.product_code } });
			resultProductId = data.product_id;
		}

		// Save images if any were uploaded
		const imageEntries: any[] = [];
		if (baseUnitImage) {
			imageEntries.push({ image_url: baseUnitImage, product_unit_id: null, product_variant_id: null, display_order: 0, is_primary: true });
		}
		for (const v of baseVariants) {
			if (v.image_url) {
				imageEntries.push({ image_url: v.image_url, product_unit_id: null, product_variant_id: null, display_order: imageEntries.length, is_primary: false });
			}
		}
		for (const au of additionalUnits) {
			if (au.image_url) {
				imageEntries.push({ image_url: au.image_url, product_unit_id: null, product_variant_id: null, display_order: imageEntries.length, is_primary: false });
			}
			for (const uv of au.variants) {
				if (uv.image_url) {
					imageEntries.push({ image_url: uv.image_url, product_unit_id: null, product_variant_id: null, display_order: imageEntries.length, is_primary: false });
				}
			}
		}
		if (imageEntries.length > 0) {
			await supabase.rpc('rpc_save_product_images', { p_product_id: resultProductId, p_images: JSON.stringify(imageEntries) });
		}

		resetCreateForm();
	}

	let editFormOriginalJson = '';

	function resetCreateForm() {
		createForm = { product_name: '', category_id: '', product_type: 'raw_material', hsn_code: '', gst_percentage: 0, description: '', default_supplier_id: '', base_unit_name: '', base_unit_code: '', base_purchase_price: 0, base_selling_price: 0, base_mrp: 0, base_barcode: '', base_barcode_type: 'internal', min_stock: 0, max_stock: 0, reorder_level: 0 };
		baseVariants = [];
		additionalUnits = [];
		baseUnitImage = '';
		selectedSupplierName = '';
		supplierSearch = '';
		editProductId = '';
		editProductCode = '';
	}

	// ==================== MANAGE ====================
	let loading = $state(false);
	let products = $state<ProductRow[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let filterType = $state('');
	let filterCategory = $state('');
	let hasMore = $derived(products.length < totalCount);
	let loadingMore = $state(false);
	const pageSize = 30;

	let detailProduct = $state<any>(null);
	let detailUnits = $state<any[]>([]);
	let detailBarcodes = $state<any[]>([]);
	let detailVariants = $state<any[]>([]);
	let detailImages = $state<any[]>([]);
	let detailLoading = $state(false);

	async function loadProducts(append = false) {
		if (append) { loadingMore = true; } else { loading = true; }
		const offset = append ? products.length : 0;
		const { data, error } = await supabase.rpc('rpc_list_products', {
			p_search: searchQuery || null,
			p_category_id: filterCategory || null,
			p_product_type: filterType || null,
			p_active_only: false,
			p_limit: pageSize,
			p_offset: offset
		});
		if (append) { loadingMore = false; } else { loading = false; }
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		const newRows = data?.data || [];
		totalCount = data?.total || 0;
		if (append) { products = [...products, ...newRows]; } else { products = newRows; }
	}

	function doSearch() { loadProducts(); }

	function handleTableScroll(e: Event) {
		if (!hasMore || loadingMore || loading) return;
		const el = e.target as HTMLElement;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
			loadProducts(true);
		}
	}

	async function viewDetail(prod: ProductRow) {
		detailLoading = true;
		detailProduct = null;
		const { data, error } = await supabase.rpc('rpc_get_product_detail', { p_product_id: prod.id });
		detailLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load details', 'error'); return; }
		detailProduct = data.product;
		detailUnits = data.units || [];
		detailBarcodes = data.barcodes || [];
		detailVariants = data.variants || [];
		detailImages = data.images || [];
	}

	function closeDetail() { detailProduct = null; }

	// Edit mode - reuses create form
	let editProductId = $state('');
	let editProductCode = $state('');
	let isEditMode = $derived(editProductId !== '');

	async function startEditProduct(prod: ProductRow) {
		// Load full detail
		const { data, error } = await supabase.rpc('rpc_get_product_detail', { p_product_id: prod.id });
		if (error || !data?.success) { toasts.add('Failed to load product', 'error'); return; }

		const p = data.product;
		const units: any[] = data.units || [];
		const barcodes: any[] = data.barcodes || [];
		const variants: any[] = data.variants || [];
		const images: any[] = data.images || [];

		// Find base unit
		const baseUnit = units.find((u: any) => u.is_base_unit) || units[0];
		const baseBarcode = baseUnit ? barcodes.find((b: any) => b.product_unit_id === baseUnit.id) : null;

		// Populate form
		editProductId = prod.id;
		editProductCode = prod.product_code;
		createForm = {
			product_name: p.product_name || '',
			category_id: p.category_id || '',
			product_type: p.product_type || 'raw_material',
			hsn_code: p.hsn_code || '',
			gst_percentage: p.gst_percentage || 0,
			description: p.description || '',
			default_supplier_id: p.default_supplier_id || '',
			base_unit_name: baseUnit?.unit_name || '',
			base_unit_code: baseUnit?.unit_short_code || '',
			base_purchase_price: baseUnit?.purchase_price || 0,
			base_selling_price: baseUnit?.selling_price || 0,
			base_mrp: baseUnit?.mrp || 0,
			base_barcode: baseBarcode?.barcode || '',
			base_barcode_type: baseBarcode?.barcode_type || 'internal',
			min_stock: p.min_stock_level || 0,
			max_stock: p.max_stock_level || 0,
			reorder_level: p.reorder_level || 0
		};

		// Supplier name for display
		selectedSupplierName = p.default_supplier_name ? p.default_supplier_name + ' (' + p.default_supplier_code + ')' : '';

		// Base unit image
		const primaryImg = images.find((i: any) => i.is_primary);
		baseUnitImage = primaryImg?.image_url || '';

		// Populate variants
		baseVariants = variants.map((v: any) => ({ variant_type: v.variant_type, variant_value: v.variant_value, price_adjustment: v.price_adjustment || 0, sku_suffix: v.sku_suffix || '', image_url: '' }));

		// Additional units (non-base)
		additionalUnits = units.filter((u: any) => !u.is_base_unit).map((u: any) => {
			const uBarcode = barcodes.find((b: any) => b.product_unit_id === u.id);
			const uImage = images.find((i: any) => i.product_unit_id === u.id && !i.is_primary);
			return {
				unit_name: u.unit_name, unit_short_code: u.unit_short_code,
				conversion_factor: u.conversion_factor,
				purchase_price: u.purchase_price || 0, selling_price: u.selling_price || 0, mrp: u.mrp || 0,
				barcode: uBarcode?.barcode || '', barcode_type: uBarcode?.barcode_type || 'internal',
				variants: [] as VariantRow[], image_url: uImage?.image_url || ''
			};
		});

		// Store original for diff
		editFormOriginalJson = JSON.stringify({ product_name: createForm.product_name, category_id: createForm.category_id, product_type: createForm.product_type, hsn_code: createForm.hsn_code, gst_percentage: createForm.gst_percentage, description: createForm.description, default_supplier_id: createForm.default_supplier_id, base_unit_name: createForm.base_unit_name, base_purchase_price: createForm.base_purchase_price, base_selling_price: createForm.base_selling_price, base_mrp: createForm.base_mrp, min_stock: createForm.min_stock, max_stock: createForm.max_stock, reorder_level: createForm.reorder_level });

		// Switch to create tab
		detailProduct = null;
		activeTab = 'create';
	}

	function tabSwitch(tab: 'create' | 'manage') {
		activeTab = tab;
		if (tab === 'manage' && products.length === 0) loadProducts();
	}

	function typeLabel(t: string) {
		if (t === 'raw_material') return 'Raw Material';
		if (t === 'finished') return 'Finished';
		if (t === 'traded') return 'Traded';
		return t;
	}
	function typeBadgeClass(t: string) {
		if (t === 'raw_material') return 'type-raw';
		if (t === 'finished') return 'type-fin';
		return 'type-trd';
	}
</script>

<div class="products-window">
	<div class="tab-bar">
		{#if isEditMode || permAdd}<button class="tab" class:active={activeTab === 'create'} onclick={() => tabSwitch('create')}>{isEditMode ? '✏️ Edit Product' : 'Create Products'}</button>{/if}
		<button class="tab" class:active={activeTab === 'manage'} onclick={() => tabSwitch('manage')}>Manage Products</button>
	</div>

	<div class="tab-content">
		{#if activeTab === 'create'}
			<div class="form-container">
				<!-- SECTION 1: Basic Info + Base Unit + Base Barcode -->
				<div class="form-card">
					<h3>{isEditMode ? '✏️ Edit: ' + editProductCode : '📋 Basic Information'}</h3>
					<div class="form-grid">
						<div class="field">
							<label>Product Name <span class="req">*</span></label>
							<input type="text" bind:value={createForm.product_name} placeholder="Enter product name" />
						</div>
						<div class="field">
							<label>Category</label>
							<select bind:value={createForm.category_id}>
								<option value="">— Select Category —</option>
								{#each categories as cat}
									<option value={cat.id}>{cat.category_name}</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label>Product Type <span class="req">*</span></label>
							<select bind:value={createForm.product_type}>
								<option value="raw_material">Raw Material</option>
								<option value="finished">Finished Product</option>
								<option value="traded">Traded (Buy & Sell)</option>
							</select>
						</div>
						<div class="field">
							<label>HSN Code</label>
							<input type="text" bind:value={createForm.hsn_code} placeholder="HSN/SAC code" />
						</div>
						<div class="field">
							<label>GST %</label>
							<select bind:value={createForm.gst_percentage}>
								<option value={0}>0%</option>
								<option value={5}>5%</option>
								<option value={12}>12%</option>
								<option value={18}>18%</option>
								<option value={28}>28%</option>
							</select>
						</div>
						<div class="field">
							<label>Description</label>
							<input type="text" bind:value={createForm.description} placeholder="Optional description" />
						</div>
						<div class="field">
							<label>Regular Supplier</label>
							{#if selectedSupplierName}
								<div class="selected-supplier">
									<span class="supplier-chip">🚚 {selectedSupplierName}</span>
									<button class="btn-remove-sm" type="button" onclick={clearSupplier}>✕</button>
								</div>
							{:else}
								<div class="supplier-search-wrap">
									<input type="text" bind:value={supplierSearch} placeholder="Search supplier by name or code..." oninput={searchSuppliers} onfocus={() => { if (supplierResults.length) showSupplierDropdown = true; }} onblur={() => setTimeout(() => showSupplierDropdown = false, 200)} />
									{#if showSupplierDropdown && supplierResults.length > 0}
										<div class="supplier-dropdown">
											{#each supplierResults as s}
												<button class="supplier-option" type="button" onmousedown={() => selectSupplier(s)}>
													<span class="so-name">{s.supplier_name}</span>
													<span class="so-code">{s.supplier_code}</span>
												</button>
											{/each}
										</div>
									{:else if supplierSearching}
										<div class="supplier-dropdown"><div class="supplier-option" style="justify-content:center;color:#888;">Searching...</div></div>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<div class="sub-section">
						<h4>📏 Base Unit</h4>
						<div class="form-grid">
							<div class="field">
								<label>Unit <span class="req">*</span></label>
								<div class="select-with-add">
									<select onchange={onBaseUnitSelect} value={unitsMaster.find(u => u.unit_name === createForm.base_unit_name)?.id || ''}>
										<option value="">— Select Unit —</option>
										{#each unitsMaster as u}
											<option value={u.id}>{u.unit_name} ({u.unit_short_code})</option>
										{/each}
									</select>
									<button class="btn-add-inline" type="button" onclick={() => openAddUnitModal((u) => { createForm.base_unit_name = u.unit_name; createForm.base_unit_code = u.unit_short_code; })}>+</button>
								</div>
							</div>
							<div class="field">
								<label>Purchase Price ₹</label>
								<input type="number" bind:value={createForm.base_purchase_price} min="0" step="0.01" />
							</div>
							<div class="field">
								<label>Selling Price ₹</label>
								<input type="number" bind:value={createForm.base_selling_price} min="0" step="0.01" />
							</div>
							<div class="field">
								<label>MRP ₹</label>
								<input type="number" bind:value={createForm.base_mrp} min="0" step="0.01" />
							</div>
						</div>
					</div>

					<div class="sub-section">
						<h4>🏷️ Base Barcode</h4>
						<div class="form-grid">
							<div class="field">
								<label>Barcode</label>
								<input type="text" bind:value={createForm.base_barcode} placeholder="Barcode number (optional)" />
							</div>
							<div class="field">
								<label>Barcode Type</label>
								<select bind:value={createForm.base_barcode_type}>
									<option value="internal">Internal</option>
									<option value="ean13">EAN-13</option>
									<option value="ean8">EAN-8</option>
									<option value="code128">Code 128</option>
									<option value="upc">UPC</option>
								</select>
							</div>
						</div>
					</div>

					<div class="sub-section">
						<h4>📸 Base Unit Image</h4>
						<div class="image-upload-area">
							{#if baseUnitImage}
								<div class="image-preview">
									<img src={baseUnitImage} alt="Base unit" />
									<button class="btn-remove-img" onclick={() => { baseUnitImage = ''; }}>✕</button>
								</div>
							{:else}
								<div class="upload-options">
									<label class="upload-box" class:uploading={baseUnitImageUploading}>
										{#if baseUnitImageUploading}
											<span class="upload-spinner">⏳</span>
											<span>Uploading...</span>
										{:else}
											<span class="upload-icon">�</span>
											<span>Gallery</span>
										{/if}
										<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={handleBaseImageUpload} hidden />
									</label>
									<label class="upload-box camera-box" class:uploading={baseUnitImageUploading}>
										<span class="upload-icon">📷</span>
										<span>Camera</span>
										<input type="file" accept="image/*" capture="environment" onchange={handleBaseImageUpload} hidden />
									</label>
									<button class="search-img-btn" type="button" onclick={() => openImageSearch((url) => { baseUnitImage = url; toasts.add('Image selected', 'success'); })}>🔍 Search</button>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- SECTION 2: Variants (connected to base unit) -->
				<div class="form-card">
					<div class="section-header">
						<h3>🎨 Variants <span class="hint-inline">(for base unit)</span></h3>
						<button class="btn-add" onclick={addBaseVariant}>+ Add Variant</button>
					</div>
					{#if baseVariants.length === 0}
						<p class="hint">No variants. Add for flavors, sizes, colors etc.</p>
					{:else}
						<div class="variant-header">
							<span class="v-type">Type</span>
							<span class="v-value">Value</span>
							<span class="v-price">Price ±₹</span>
							<span class="v-sku">SKU Suffix</span>
							<span class="v-act"></span>
						</div>
						{#each baseVariants as v, i}
							<div class="variant-row-wrap">
							<div class="variant-row">
								<input class="v-type" type="text" bind:value={v.variant_type} placeholder="Flavor, Size..." />
								<input class="v-value" type="text" bind:value={v.variant_value} placeholder="Spicy, 500ml..." />
								<input class="v-price" type="number" bind:value={v.price_adjustment} step="0.01" />
								<input class="v-sku" type="text" bind:value={v.sku_suffix} placeholder="SPY, 500" />
								<button class="btn-remove" onclick={() => removeBaseVariant(i)}>✕</button>
							</div>
							<div class="variant-image-row">
								{#if v.image_url}
									<div class="image-preview-sm">
										<img src={v.image_url} alt="Variant" />
										<button class="btn-remove-img-sm" onclick={() => { baseVariants[i].image_url = ''; baseVariants = [...baseVariants]; }}>✕</button>
									</div>
								{:else}
									<label class="upload-box-sm">
										<span>� Gallery</span>
										<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(e) => handleVariantImageUpload(e, v, () => { baseVariants = [...baseVariants]; })} hidden />
									</label>
									<label class="upload-box-sm camera-box-sm">
										<span>📷 Camera</span>
										<input type="file" accept="image/*" capture="environment" onchange={(e) => handleVariantImageUpload(e, v, () => { baseVariants = [...baseVariants]; })} hidden />
									</label>
									<button class="search-img-btn-sm" type="button" onclick={() => openImageSearch((url) => { baseVariants[i].image_url = url; baseVariants = [...baseVariants]; toasts.add('Image selected', 'success'); })}>🔍</button>
								{/if}
							</div>
						</div>
						{/each}
					{/if}
				</div>

				<!-- SECTION 3: Additional Units -->
				<div class="form-card">
					<div class="section-header">
						<h3>📦 Additional Units</h3>
						<button class="btn-add" onclick={addAdditionalUnit}>+ Add Unit</button>
					</div>
					{#if additionalUnits.length === 0}
						<p class="hint">No additional units. Add for bulk packing (Case, Carton, Box, etc.)</p>
					{:else}
						{#each additionalUnits as au, ui}
							<div class="additional-unit-card">
								<div class="au-header">
									<span class="au-title">Unit #{ui + 1}</span>
									<button class="btn-remove" onclick={() => removeAdditionalUnit(ui)}>✕ Remove</button>
								</div>
								<div class="form-grid">
									<div class="field">
										<label>Unit <span class="req">*</span></label>
										<div class="select-with-add">
											<select onchange={(e) => onAdditionalUnitSelect(e, ui)} value={unitsMaster.find(u => u.unit_name === au.unit_name)?.id || ''}>
												<option value="">— Select Unit —</option>
												{#each unitsMaster as u}
													<option value={u.id}>{u.unit_name} ({u.unit_short_code})</option>
												{/each}
											</select>
											<button class="btn-add-inline" type="button" onclick={() => openAddUnitModal((u) => { additionalUnits[ui].unit_name = u.unit_name; additionalUnits[ui].unit_short_code = u.unit_short_code; additionalUnits = [...additionalUnits]; })}>+</button>
										</div>
									</div>
									<div class="field">
										<label>= How many {createForm.base_unit_name || 'base units'} <span class="req">*</span></label>
										<input type="number" bind:value={au.conversion_factor} min="1" step="1" />
									</div>
									<div class="field">
										<label>Purchase Price ₹</label>
										<input type="number" bind:value={au.purchase_price} min="0" step="0.01" />
									</div>
									<div class="field">
										<label>Selling Price ₹</label>
										<input type="number" bind:value={au.selling_price} min="0" step="0.01" />
									</div>
									<div class="field">
										<label>MRP ₹</label>
										<input type="number" bind:value={au.mrp} min="0" step="0.01" />
									</div>
									<div class="field">
										<label>Barcode</label>
										<input type="text" bind:value={au.barcode} placeholder="Barcode (optional)" />
									</div>
									<div class="field">
										<label>Barcode Type</label>
										<select bind:value={au.barcode_type}>
											<option value="internal">Internal</option>
											<option value="ean13">EAN-13</option>
											<option value="ean8">EAN-8</option>
											<option value="code128">Code 128</option>
											<option value="upc">UPC</option>
										</select>
									</div>
								</div>

								<!-- Unit Image -->
								<div class="au-image-section">
									<span class="au-img-label">📸 Unit Image</span>
									{#if au.image_url}
										<div class="image-preview-sm">
											<img src={au.image_url} alt="Unit {ui + 1}" />
											<button class="btn-remove-img-sm" onclick={() => { additionalUnits[ui].image_url = ''; additionalUnits = [...additionalUnits]; }}>✕</button>
										</div>
									{:else}
										<label class="upload-box-sm">
											<span>� Gallery</span>
											<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(e) => handleAdditionalUnitImageUpload(e, ui)} hidden />
										</label>
										<label class="upload-box-sm camera-box-sm">
											<span>📷 Camera</span>
											<input type="file" accept="image/*" capture="environment" onchange={(e) => handleAdditionalUnitImageUpload(e, ui)} hidden />
										</label>
										<button class="search-img-btn-sm" type="button" onclick={() => openImageSearch((url) => { additionalUnits[ui].image_url = url; additionalUnits = [...additionalUnits]; toasts.add('Image selected', 'success'); })}>🔍</button>
									{/if}
								</div>

								<!-- Unit-specific variants -->
								<div class="au-variants">
									<div class="au-var-header">
										<span>Variants for this unit</span>
										<button class="btn-add-sm" onclick={() => addUnitVariant(ui)}>+ Variant</button>
									</div>
									{#if au.variants.length > 0}
										{#each au.variants as uv, vi}
										<div class="variant-row-wrap">
											<div class="variant-row">
												<input class="v-type" type="text" bind:value={uv.variant_type} placeholder="Type" />
												<input class="v-value" type="text" bind:value={uv.variant_value} placeholder="Value" />
												<input class="v-price" type="number" bind:value={uv.price_adjustment} step="0.01" />
												<input class="v-sku" type="text" bind:value={uv.sku_suffix} placeholder="SKU" />
												<button class="btn-remove" onclick={() => removeUnitVariant(ui, vi)}>✕</button>
											</div>
											<div class="variant-image-row">
												{#if uv.image_url}
													<div class="image-preview-sm">
														<img src={uv.image_url} alt="Variant" />
														<button class="btn-remove-img-sm" onclick={() => { additionalUnits[ui].variants[vi].image_url = ''; additionalUnits = [...additionalUnits]; }}>✕</button>
													</div>
												{:else}
													<label class="upload-box-sm">
														<span>� Gallery</span>
														<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(e) => handleVariantImageUpload(e, uv, () => { additionalUnits = [...additionalUnits]; })} hidden />
													</label>
													<label class="upload-box-sm camera-box-sm">
														<span>📷 Camera</span>
														<input type="file" accept="image/*" capture="environment" onchange={(e) => handleVariantImageUpload(e, uv, () => { additionalUnits = [...additionalUnits]; })} hidden />
													</label>
													<button class="search-img-btn-sm" type="button" onclick={() => openImageSearch((url) => { additionalUnits[ui].variants[vi].image_url = url; additionalUnits = [...additionalUnits]; toasts.add('Image selected', 'success'); })}>🔍</button>
												{/if}
											</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<!-- SECTION 4: Stock Levels -->
				<div class="form-card">
					<h3>📊 Stock Levels</h3>
					<div class="form-grid three-col">
						<div class="field">
							<label>Min Stock</label>
							<input type="number" bind:value={createForm.min_stock} min="0" step="0.01" />
						</div>
						<div class="field">
							<label>Max Stock</label>
							<input type="number" bind:value={createForm.max_stock} min="0" step="0.01" />
						</div>
						<div class="field">
							<label>Reorder Level</label>
							<input type="number" bind:value={createForm.reorder_level} min="0" step="0.01" />
						</div>
					</div>
				</div>

				<div class="form-actions-sticky">
					{#if isEditMode}
						<button class="btn-secondary" onclick={resetCreateForm}>Cancel Edit</button>
						<button class="btn-primary" onclick={handleCreate} disabled={createLoading}>
							{createLoading ? 'Updating...' : 'Update Product'}
						</button>
					{:else}
						<button class="btn-secondary" onclick={resetCreateForm}>Clear All</button>
						<button class="btn-primary" onclick={handleCreate} disabled={createLoading}>
							{createLoading ? 'Creating...' : 'Create Product'}
						</button>
					{/if}
				</div>
			</div>

		{:else}
			<!-- MANAGE -->
			<div class="manage-container">
				{#if detailProduct}
					<div class="detail-panel">
						<div class="detail-header">
							<h3>{detailProduct.product_code} — {detailProduct.product_name}</h3>
							<div class="detail-header-actions">
								{#if permEdit}
									<button class="btn-primary btn-sm" onclick={() => startEditProduct(detailProduct)}>✏️ Edit</button>
								{/if}
								<button class="btn-ghost" onclick={closeDetail}>✕ Close</button>
							</div>
						</div>

						<div class="detail-info">
							<div class="di-row"><span class="di-label">Type</span><span class="type-badge {typeBadgeClass(detailProduct.product_type)}">{typeLabel(detailProduct.product_type)}</span></div>
							<div class="di-row"><span class="di-label">Category</span><span>{detailProduct.category_name || '—'}</span></div>
							<div class="di-row"><span class="di-label">HSN</span><span>{detailProduct.hsn_code || '—'}</span></div>
							<div class="di-row"><span class="di-label">GST</span><span>{detailProduct.gst_percentage}%</span></div>
							<div class="di-row"><span class="di-label">Status</span><span class="badge" class:active={detailProduct.is_active} class:inactive={!detailProduct.is_active}>{detailProduct.is_active ? 'Active' : 'Inactive'}</span></div>
							<div class="di-row"><span class="di-label">Supplier</span><span>{detailProduct.default_supplier_name ? detailProduct.default_supplier_name + ' (' + detailProduct.default_supplier_code + ')' : '—'}</span></div>
						</div>

						{#if detailUnits.length > 0}
							<div class="detail-section">
								<h4>📏 Units ({detailUnits.length})</h4>
								<table class="detail-table">
									<thead><tr><th>Unit</th><th>Code</th><th>Factor</th><th>Purchase</th><th>Selling</th><th>MRP</th><th>Flags</th></tr></thead>
									<tbody>
										{#each detailUnits as u}
											<tr>
												<td>{u.unit_name}</td>
												<td class="code">{u.unit_short_code}</td>
												<td>{u.conversion_factor}</td>
												<td>₹{u.purchase_price}</td>
												<td>₹{u.selling_price}</td>
												<td>₹{u.mrp}</td>
												<td class="flags">
													{#if u.is_base_unit}<span class="flag base">Base</span>{/if}
													{#if u.is_purchase_unit}<span class="flag">Buy</span>{/if}
													{#if u.is_sales_unit}<span class="flag">Sell</span>{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						{#if detailBarcodes.length > 0}
							<div class="detail-section">
								<h4>🏷️ Barcodes ({detailBarcodes.length})</h4>
								<table class="detail-table">
									<thead><tr><th>Barcode</th><th>Type</th><th>Unit</th></tr></thead>
									<tbody>
										{#each detailBarcodes as b}
											<tr><td class="code">{b.barcode}</td><td>{b.barcode_type}</td><td>{b.unit_name || '—'}</td></tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						{#if detailVariants.length > 0}
							<div class="detail-section">
								<h4>🎨 Variants ({detailVariants.length})</h4>
								<table class="detail-table">
									<thead><tr><th>Type</th><th>Value</th><th>Price ±</th></tr></thead>
									<tbody>
										{#each detailVariants as v}
											<tr><td>{v.variant_type}</td><td>{v.variant_value}</td><td>{v.price_adjustment > 0 ? '+' : ''}{v.price_adjustment ? '₹' + v.price_adjustment : '—'}</td></tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						{#if detailImages.length > 0}
							<div class="detail-section">
								<h4>📸 Images ({detailImages.length})</h4>
								<div class="detail-images-grid">
									{#each detailImages as img}
										<div class="detail-image-card">
											<img src={img.image_url} alt="Product" />
											<div class="detail-image-info">
												{#if img.is_primary}<span class="flag base">Primary</span>{/if}
												{#if img.unit_name}<span class="flag">{img.unit_name}</span>{/if}
												{#if img.variant_value}<span class="flag">{img.variant_value}</span>{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<div class="search-bar">
						<input type="text" bind:value={searchQuery} placeholder="Search products..." onkeydown={(e) => e.key === 'Enter' && doSearch()} />
						<select bind:value={filterType} onchange={doSearch}>
							<option value="">All Types</option>
							<option value="raw_material">Raw Material</option>
							<option value="finished">Finished</option>
							<option value="traded">Traded</option>
						</select>
						<select bind:value={filterCategory} onchange={doSearch}>
							<option value="">All Categories</option>
							{#each categories as cat}
								<option value={cat.id}>{cat.category_name}</option>
							{/each}
						</select>
						<button class="btn-primary btn-sm" onclick={doSearch}>Search</button>
					</div>

					{#if loading}
						<div class="loading-msg">Loading...</div>
					{:else if products.length === 0}
						<div class="empty-msg">No products found. Create one first.</div>
					{:else}
						<div class="table-wrap" onscroll={handleTableScroll}>
							<table>
								<thead>
									<tr>
										<th class="hide-mobile">Code</th>
										<th>Product Name</th>
										<th class="hide-mobile">Type</th>
										<th class="hide-mobile">Category</th>
										<th class="hide-mobile">Base Unit</th>
										<th class="hide-mobile">Supplier</th>
										<th class="hide-mobile">Units</th>
										<th class="hide-mobile">Variants</th>
										<th class="hide-mobile">GST</th>
										<th class="hide-mobile">Status</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{#each products as prod}
										<tr>
											<td class="code hide-mobile">{prod.product_code}</td>
											<td>
												<div class="prod-name-cell">
													<span class="prod-title">{prod.product_name}</span>
													<span class="prod-meta-mobile">{prod.product_code} • <span class="type-badge {typeBadgeClass(prod.product_type)}">{typeLabel(prod.product_type)}</span></span>
												</div>
											</td>
											<td class="hide-mobile"><span class="type-badge {typeBadgeClass(prod.product_type)}">{typeLabel(prod.product_type)}</span></td>
											<td class="hide-mobile">{prod.category_name || '—'}</td>
											<td class="hide-mobile">{prod.base_unit || '—'}</td>
											<td class="hide-mobile">{prod.default_supplier_name || '—'}</td>
											<td class="center hide-mobile">{prod.units_count}</td>
											<td class="center hide-mobile">{prod.variants_count}</td>
											<td class="center hide-mobile">{prod.gst_percentage}%</td>
											<td class="hide-mobile"><span class="badge" class:active={prod.is_active} class:inactive={!prod.is_active}>{prod.is_active ? 'Active' : 'Inactive'}</span></td>
											<td class="actions-cell">
												<button class="btn-ghost btn-xs" onclick={() => viewDetail(prod)}>👁️</button>
												{#if permEdit}<button class="btn-ghost btn-xs" onclick={() => startEditProduct(prod)}>✏️</button>{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						{#if loadingMore}
							<div class="loading-more">Loading more...</div>
						{/if}
						<div class="total-count">{products.length} of {totalCount} products</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if showAddUnitModal}
	<div class="modal-overlay" onclick={() => showAddUnitModal = false}>
		<div class="modal-box" onclick={(e) => e.stopPropagation()}>
			<h3>Add New Unit</h3>
			<div class="modal-fields">
				<div class="field">
					<label>Unit Name <span class="req">*</span></label>
					<input type="text" bind:value={newUnitName} placeholder="e.g. Sachet, Tin, Strip..." />
				</div>
				<div class="field">
					<label>Short Code <span class="req">*</span></label>
					<input type="text" bind:value={newUnitCode} placeholder="e.g. sct, tin, str" />
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showAddUnitModal = false}>Cancel</button>
				<button class="btn-primary" onclick={handleAddUnit} disabled={addUnitLoading}>{addUnitLoading ? 'Saving...' : 'Add Unit'}</button>
			</div>
		</div>
	</div>
{/if}

<ImageSearchModal bind:show={showImageSearch} onSelect={handleImageSearchSelect} initialQuery={imageSearchQuery} />

<style>
	.products-window { height: 100%; display: flex; flex-direction: column; background: #F8F8F5; }

	.tab-bar { display: flex; background: white; border-bottom: 1px solid #E8E8E8; flex-shrink: 0; }
	.tab { flex: 1; padding: 14px 16px; border: none; background: none; font-size: 13px; font-weight: 600; color: #888; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
	.tab:hover { color: #555; background: #fafafa; }
	.tab.active { color: #0E5A3C; border-bottom-color: #0E5A3C; }

	.tab-content { flex: 1; overflow-y: auto; }

	/* Form */
	.form-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
	.form-card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
	.form-card h3 { margin: 0 0 16px; font-size: 14px; font-weight: 700; color: #2B2B2B; }

	.sub-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
	.sub-section h4 { margin: 0 0 12px; font-size: 13px; font-weight: 700; color: #444; }

	.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
	.section-header h3 { margin: 0; }

	.hint-inline { font-size: 11px; font-weight: 400; color: #999; }

	.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
	.form-grid.three-col { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }

	.prod-name-cell { display: flex; flex-direction: column; }
	.prod-title { font-weight: 600; }
	.prod-meta-mobile { display: none; font-size: 10px; color: #888; margin-top: 2px; }

	@media (max-width: 768px) {
		.hide-mobile { display: none !important; }
		.prod-meta-mobile { display: block; }
		.search-bar { flex-wrap: wrap; }
		.search-bar input { flex: 1 1 100%; }
		.search-bar select { flex: 1 1 45%; }
		.form-grid { grid-template-columns: 1fr; }
		.form-grid.three-col { grid-template-columns: 1fr; }
		.form-card { padding: 14px; }
		.form-container { padding: 4px; }
		.variant-header { display: none; }
		.variant-row { flex-wrap: wrap; gap: 8px; }
		.v-type, .v-value, .v-price, .v-sku { flex: 1 1 100%; }
		.detail-panel { padding: 12px; }
		.detail-header { flex-wrap: wrap; gap: 8px; }
		.detail-header h3 { font-size: 14px; word-break: break-word; }
		.detail-info { grid-template-columns: 1fr 1fr; gap: 10px; }
		.detail-section { overflow-x: auto; max-width: 100%; }
		.table-wrap { max-height: none; }
	}

	.field { display: flex; flex-direction: column; gap: 4px; }
	.field label { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.3px; }
	.req { color: #e53e3e; }

	.field input, .field select {
		padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; background: #fafafa; transition: border-color 0.2s;
	}
	.field input:focus, .field select:focus { outline: none; border-color: #0E5A3C; background: white; }

	/* Variants */
	.variant-header { display: flex; gap: 6px; padding: 4px 0; font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; }
	.variant-row { display: flex; gap: 6px; align-items: center; margin-bottom: 0; }
	.variant-row input { padding: 7px 8px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 12px; background: #fafafa; }
	.variant-row input:focus { outline: none; border-color: #0E5A3C; }

	.variant-row-wrap { margin-bottom: 8px; }
	.variant-image-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; padding-left: 4px; }
	.v-type { flex: 1.2; }
	.v-value { flex: 1.2; }
	.v-price { flex: 0.8; }
	.v-sku { flex: 0.8; }
	.v-act { flex: 0 0 28px; }

	.hint { margin: 4px 0 0; font-size: 11px; color: #aaa; }

	/* Additional unit cards */
	.additional-unit-card {
		background: #fafaf8; border: 1px solid #eee; border-radius: 8px;
		padding: 16px; margin-bottom: 12px;
	}
	.au-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
	.au-title { font-size: 12px; font-weight: 700; color: #555; }

	.au-variants { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e0e0e0; }
	.au-var-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; color: #888; }

	/* Buttons */
	.btn-primary { padding: 9px 20px; background: #0E5A3C; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-primary:hover { background: #0a4a30; }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
	.btn-primary.btn-sm { padding: 7px 14px; font-size: 12px; }

	.btn-secondary { padding: 9px 20px; background: #f0f0f0; color: #333; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }

	.btn-add { padding: 5px 12px; background: #e8f5ee; color: #0E5A3C; border: 1px solid #c3e6d1; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; }
	.btn-add:hover { background: #d4eddd; }

	.btn-add-sm { padding: 3px 8px; background: #e8f5ee; color: #0E5A3C; border: 1px solid #c3e6d1; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; }

	.btn-remove { padding: 2px 6px; background: #fee; color: #c53030; border: 1px solid #fcc; border-radius: 4px; font-size: 12px; cursor: pointer; flex-shrink: 0; }
	.btn-remove:hover { background: #fdd; }

	.btn-ghost { background: none; border: none; color: #666; cursor: pointer; font-size: 13px; }
	.btn-ghost:hover { color: #333; }
	.btn-xs { padding: 4px 8px; font-size: 12px; }

	.form-actions-sticky { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; background: white; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }

	/* Manage */
	.manage-container { padding: 16px; }

	.search-bar { display: flex; gap: 8px; margin-bottom: 14px; }
	.search-bar input { flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; }
	.search-bar input:focus { outline: none; border-color: #0E5A3C; }
	.search-bar select { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; }

	.table-wrap { background: white; border-radius: 8px; overflow: auto; max-height: calc(100vh - 280px); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
	table { width: 100%; border-collapse: collapse; font-size: 12px; }
	thead th { padding: 9px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #777; background: #fafafa; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 1; }
	tbody td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; color: #333; }
	tbody tr:hover { background: #f9f9f7; }

	.code { font-family: monospace; font-size: 11px; color: #0E5A3C; font-weight: 600; }
	.center { text-align: center; }

	.type-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
	.type-raw { background: #fff3e0; color: #e65100; }
	.type-fin { background: #e8f5e9; color: #2e7d32; }
	.type-trd { background: #e3f2fd; color: #1565c0; }

	.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
	.badge.active { background: #e6f4ec; color: #0E5A3C; }
	.badge.inactive { background: #fce8e8; color: #c53030; }

	.loading-msg, .empty-msg { text-align: center; padding: 40px; color: #999; font-size: 14px; }

	.loading-more { text-align: center; padding: 10px; color: #999; font-size: 12px; }
	.total-count { text-align: center; padding: 6px; font-size: 11px; color: #aaa; }

	.actions-cell { display: flex; gap: 4px; }

	/* Detail Panel */
	.detail-panel { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow-x: auto; }
	.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
	.detail-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #2B2B2B; }
	.detail-header-actions { display: flex; gap: 6px; align-items: center; }

	/* Edit form in detail */
	.edit-form { margin-bottom: 16px; }
	.edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #eee; }

	.detail-info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 20px; }
	.di-row { display: flex; flex-direction: column; gap: 2px; }
	.di-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #999; }

	.detail-section { margin-bottom: 16px; }
	.detail-section h4 { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #444; }

	.detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
	.detail-table th { padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #999; border-bottom: 1px solid #eee; }
	.detail-table td { padding: 6px 8px; border-bottom: 1px solid #f5f5f5; }

	.flags { display: flex; gap: 4px; }
	.flag { padding: 1px 6px; background: #f0f0f0; border-radius: 8px; font-size: 10px; color: #555; }
	.flag.base { background: #0E5A3C; color: white; }

	/* Image upload styles */
	.image-upload-area { margin-top: 8px; }
	.upload-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
		border: 2px dashed #d0d0d0; border-radius: 10px; padding: 20px; cursor: pointer;
		transition: border-color 0.2s, background 0.2s; text-align: center; color: #888; font-size: 13px; }
	.upload-box:hover { border-color: #0E5A3C; background: #f0faf5; }
	.upload-box.uploading { border-color: #C9A24D; background: #fffdf5; cursor: wait; }
	.upload-icon { font-size: 28px; }
	.upload-spinner { font-size: 24px; }
	.upload-hint { font-size: 10px; color: #aaa; }

	.image-preview { position: relative; display: inline-block; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0; }
	.image-preview img { display: block; max-width: 200px; max-height: 160px; object-fit: cover; }
	.btn-remove-img { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; border: none;
		border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
	.btn-remove-img:hover { background: #e53e3e; }

	/* Additional unit image */
	.au-image-section { display: flex; align-items: center; gap: 10px; margin: 10px 0 6px; padding-top: 8px; border-top: 1px dashed #eee; }
	.au-img-label { font-size: 12px; font-weight: 600; color: #666; white-space: nowrap; }
	.upload-box-sm { display: inline-flex; align-items: center; gap: 6px;
		padding: 6px 14px; border: 1px dashed #ccc; border-radius: 8px; cursor: pointer;
		font-size: 12px; color: #888; transition: border-color 0.2s; }
	.upload-box-sm:hover { border-color: #0E5A3C; color: #0E5A3C; }

	/* Search image buttons */
	.upload-options { display: flex; align-items: center; gap: 8px; }
	.search-img-btn { padding: 8px 16px; border: 1px solid #C9A24D; border-radius: 8px; background: #fffcf5;
		color: #C9A24D; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
	.search-img-btn:hover { background: #C9A24D; color: white; }
	.search-img-btn-sm { padding: 4px 8px; border: 1px solid #C9A24D; border-radius: 6px; background: #fffcf5;
		color: #C9A24D; font-size: 11px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
	.search-img-btn-sm:hover { background: #C9A24D; color: white; }

	.image-preview-sm { position: relative; display: inline-block; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }
	.image-preview-sm img { display: block; width: 64px; height: 64px; object-fit: cover; }
	.btn-remove-img-sm { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; border: none;
		border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center; }

	/* Detail images grid */
	.detail-images-grid { display: flex; flex-wrap: wrap; gap: 10px; }
	.detail-image-card { border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; background: white; }
	.detail-image-card img { display: block; width: 120px; height: 100px; object-fit: cover; }
	.detail-image-info { padding: 4px 6px; display: flex; gap: 4px; flex-wrap: wrap; }

	/* Select with + button */
	.select-with-add { display: flex; gap: 4px; align-items: stretch; }
	.select-with-add select { flex: 1; padding: 8px 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 12px; background: #fafafa; }
	.select-with-add select:focus { outline: none; border-color: #0E5A3C; }
	.btn-add-inline { width: 32px; border: 1px solid #e0e0e0; border-radius: 6px; background: #f0faf5; color: #0E5A3C; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
	.btn-add-inline:hover { background: #0E5A3C; color: white; }

	/* Add Unit Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 9999; }
	.modal-box { background: white; border-radius: 12px; padding: 24px; width: 360px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
	.modal-box h3 { margin: 0 0 16px; font-size: 15px; font-weight: 700; color: #2B2B2B; }
	.modal-fields { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
	.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

	/* Supplier search */
	.supplier-search-wrap { position: relative; }
	.supplier-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; z-index: 100; margin-top: 2px; }
	.supplier-option { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; font-size: 12px; text-align: left; transition: background 0.15s; }
	.supplier-option:hover { background: #f0faf5; }
	.so-name { font-weight: 600; color: #2B2B2B; }
	.so-code { font-size: 11px; color: #999; }
	.selected-supplier { display: flex; align-items: center; gap: 6px; }
	.supplier-chip { padding: 6px 12px; background: #f0faf5; border: 1px solid #c8e6d8; border-radius: 6px; font-size: 12px; font-weight: 600; color: #0E5A3C; }
	.btn-remove-sm { border: none; background: none; color: #999; font-size: 14px; cursor: pointer; padding: 2px 4px; }
	.btn-remove-sm:hover { color: #e53e3e; }

	/* Mobile responsive styles */
	@media (max-width: 768px) {
		.form-grid {
			grid-template-columns: 1fr !important;
		}

		.form-card {
			padding: 14px;
		}

		.modal-box {
			width: 90vw;
			padding: 16px;
		}

		.search-bar {
			flex-direction: column;
		}

		.search-bar input, .search-bar select {
			width: 100%;
			box-sizing: border-box;
		}

		.hide-mobile {
			display: none !important;
		}

		.prod-name-cell {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		.prod-meta-mobile {
			display: inline;
			font-size: 10px;
			color: #888;
		}

		.form-actions-sticky {
			position: sticky;
			bottom: 0;
			padding: 12px 4px;
			margin: 0 -4px;
			box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
			z-index: 10;
		}
	}

	@media (min-width: 769px) {
		.prod-meta-mobile {
			display: none;
		}
	}
</style>
