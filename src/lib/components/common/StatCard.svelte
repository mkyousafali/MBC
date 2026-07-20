<script lang="ts">
	let { label, value, change = '', changeType = 'neutral', icon = '' }: {
		label: string; value: string; change?: string;
		changeType?: 'positive' | 'negative' | 'neutral'; icon?: string;
	} = $props();
</script>

<div class="stat-card">
	<div class="stat-icon">{icon}</div>
	<div class="stat-content">
		<span class="stat-label">{label}</span>
		<span class="stat-value">{value}</span>
		{#if change}
			<span class="stat-change change-{changeType}">{change}</span>
		{/if}
	</div>
</div>

<style>
	.stat-card {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		transition: box-shadow var(--transition-fast);
	}
	.stat-card:hover { box-shadow: var(--shadow-md); }
	.stat-icon {
		font-size: 1.8rem;
		width: 48px; height: 48px;
		display: flex; align-items: center; justify-content: center;
		background: var(--color-primary-50);
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}
	.stat-content { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.stat-label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
	.stat-value { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); }
	.stat-change { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
	.change-positive { color: var(--color-success); }
	.change-negative { color: var(--color-danger); }
	.change-neutral { color: var(--color-text-light); }
</style>
