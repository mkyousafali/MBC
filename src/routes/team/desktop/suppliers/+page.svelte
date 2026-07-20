<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { suppliers } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'name', label: 'Supplier' },
		{ key: 'contact', label: 'Contact' },
		{ key: 'email', label: 'Email' },
		{ key: 'items', label: 'Items Supplied' },
		{ key: 'status', label: 'Status' }
	];
</script>

<PageHeader
	title="Suppliers"
	description="Manage your supplier contacts and details"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Suppliers' }]}
/>
<DataTable columns={columns} rows={suppliers} searchable />
