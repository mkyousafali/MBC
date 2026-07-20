<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { stockItems } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'name', label: 'Item' },
		{ key: 'quantity', label: 'Quantity' },
		{ key: 'unit', label: 'Unit' },
		{ key: 'minLevel', label: 'Min Level' },
		{ key: 'status', label: 'Status' }
	];
</script>

<PageHeader
	title="Inventory"
	description="Track stock levels and manage inventory"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Inventory' }]}
/>
<DataTable columns={columns} rows={stockItems} searchable />
