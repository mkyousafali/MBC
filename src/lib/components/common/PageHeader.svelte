<script lang="ts">
	let { breadcrumbs, title, description = '' }: {
		breadcrumbs: { label: string; href?: string }[];
		title: string;
		description?: string;
	} = $props();
</script>

<div class="page-header">
	<nav class="breadcrumbs" aria-label="Breadcrumb">
		{#each breadcrumbs as crumb, i}
			{#if i > 0}<span class="separator">/</span>{/if}
			{#if crumb.href}
				<a href={crumb.href}>{crumb.label}</a>
			{:else}
				<span class="current">{crumb.label}</span>
			{/if}
		{/each}
	</nav>
	<h1>{title}</h1>
	{#if description}
		<p class="description">{description}</p>
	{/if}
</div>

<style>
	.page-header {
		margin-bottom: var(--space-6);
	}
	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-2);
		flex-wrap: wrap;
	}
	.breadcrumbs a { color: var(--color-primary); }
	.breadcrumbs a:hover { text-decoration: underline; }
	.separator { color: var(--color-text-light); }
	.current { color: var(--color-text-secondary); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-1); }
	.description { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
</style>
