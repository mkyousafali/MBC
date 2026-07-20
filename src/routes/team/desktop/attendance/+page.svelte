<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { employees } from '$lib/data/demo';

	const columns = [
		{ key: 'name', label: 'Employee' },
		{ key: 'role', label: 'Role' },
		{ key: 'shift', label: 'Shift' },
		{ key: 'clockIn', label: 'Clock In' },
		{ key: 'clockOut', label: 'Clock Out' },
		{ key: 'status', label: 'Status' }
	];
	const rows = employees.map(e => ({
		...e,
		clockIn: e.status === 'active' ? '9:00 AM' : '—',
		clockOut: '—',
		status: e.status === 'active' ? 'Present' : 'Absent'
	}));
</script>

<PageHeader
	title="Attendance"
	description="Track employee attendance and shift timings"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Attendance' }]}
/>
<DataTable columns={columns} {rows} searchable />
