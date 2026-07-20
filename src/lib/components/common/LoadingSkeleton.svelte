<script lang="ts">
	let { rows = 5, columns = 4 }: { rows?: number; columns?: number } = $props();
</script>

<div class="skeleton-table">
	<div class="skeleton-header">
		{#each Array(columns) as _, i}
			<div class="skeleton-cell header-cell" style="width: {100/columns}%"></div>
		{/each}
	</div>
	{#each Array(rows) as _, r}
		<div class="skeleton-row">
			{#each Array(columns) as _, c}
				<div class="skeleton-cell" style="width: {100/columns}%"></div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.skeleton-table { width: 100%; }
	.skeleton-header, .skeleton-row {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}
	.skeleton-header { border-bottom: 1px solid var(--color-border-light); }
	.skeleton-row { border-bottom: 1px solid var(--color-border-light); }
	.skeleton-cell {
		height: 16px;
		background: linear-gradient(90deg, var(--color-bg-alt) 25%, var(--color-border-light) 50%, var(--color-bg-alt) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: var(--radius-sm);
	}
	.header-cell { height: 12px; opacity: 0.7; }
	@keyframes shimmer {
		0% { background-position: -200% 0; }
		100% { background-position: 200% 0; }
	}
</style>
