<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
</script>

<PageHeader
	title="Customers"
	description="View and manage customer profiles and history"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Customers' }]}
/>
<div class="page-card">
	<EmptyState title="Customer Management" message="Customer directory and profile management coming soon." icon="👥" />
</div>

<style>
	.page-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
</style>
