<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import DataTable from '$lib/components/common/DataTable.svelte';
	import { menuItems } from '$lib/data/demo';

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'name', label: 'Item Name' },
		{ key: 'category', label: 'Category' },
		{ key: 'price', label: 'Price (₹)' },
		{ key: 'isVeg', label: 'Type' },
		{ key: 'isPopular', label: 'Popular' }
	];
	const rows = menuItems.map(i => ({
		...i,
		isVeg: i.isVeg ? 'Veg' : 'Non-Veg',
		isPopular: i.isPopular ? 'Yes' : 'No'
	}));
</script>

<PageHeader
	title="Menu Management"
	description="Add, edit and organise your restaurant menu"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Menu Management' }]}
/>
<DataTable {columns} {rows} searchable />
