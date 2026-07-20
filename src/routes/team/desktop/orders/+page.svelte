<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { transactions } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'Transaction ID' },
		{ key: 'orderId', label: 'Order ID' },
		{ key: 'customer', label: 'Customer' },
		{ key: 'amount', label: 'Amount (₹)' },
		{ key: 'method', label: 'Method' },
		{ key: 'time', label: 'Time' },
		{ key: 'status', label: 'Status' }
	];
</script>

<PageHeader
	title="Orders"
	description="View and manage all customer orders"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Orders' }]}
/>
<DataTable columns={columns} rows={transactions} searchable />
