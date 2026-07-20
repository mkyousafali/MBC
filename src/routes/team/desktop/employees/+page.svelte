<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { employees } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'name', label: 'Name' },
		{ key: 'role', label: 'Role' },
		{ key: 'mobile', label: 'Mobile' },
		{ key: 'email', label: 'Email' },
		{ key: 'shift', label: 'Shift' },
		{ key: 'status', label: 'Status' }
	];
</script>

<PageHeader
	title="Employees"
	description="Manage staff profiles, roles and access"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Employees' }]}
/>
<DataTable columns={columns} rows={employees} searchable />
