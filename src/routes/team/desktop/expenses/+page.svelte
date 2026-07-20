<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { expenses } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'category', label: 'Category' },
		{ key: 'description', label: 'Description' },
		{ key: 'amount', label: 'Amount (₹)' },
		{ key: 'date', label: 'Date' },
		{ key: 'status', label: 'Status' }
	];
</script>

<PageHeader
	title="Expenses"
	description="Track and manage restaurant expenses"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Expenses' }]}
/>
<DataTable columns={columns} rows={expenses} searchable />
