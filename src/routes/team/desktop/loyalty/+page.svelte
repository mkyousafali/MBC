<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
</script>

<PageHeader
	title="Loyalty Programme"
	description="Manage customer loyalty points and rewards"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Loyalty' }]}
/>
<div class="page-card">
	<EmptyState title="Loyalty Programme" message="Loyalty points tracking and reward management coming soon." icon="⭐" />
</div>

<style>
	.page-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
</style>
