<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { kitchenOrders } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'Order ID' },
		{ key: 'items', label: 'Items' },
		{ key: 'status', label: 'Status' },
		{ key: 'time', label: 'Time' },
		{ key: 'priority', label: 'Priority' }
	];
	const rows = kitchenOrders.map(o => ({ ...o, items: o.items.join(', ') }));
</script>

<PageHeader
	title="POS — Point of Sale"
	description="Process customer orders and payments"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'POS' }]}
/>
<DataTable {columns} {rows} searchable />
