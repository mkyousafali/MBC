<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
</script>

<PageHeader
	title="Purchases"
	description="Manage purchase orders and supplier deliveries"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Purchases' }]}
/>
<div class="page-card">
	<EmptyState title="No Purchase Orders" message="Purchase order management will be available soon." icon="🛒" />
</div>

<style>
	.page-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
</style>
