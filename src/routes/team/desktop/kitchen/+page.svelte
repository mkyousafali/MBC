<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import Badge from '$lib/components/common/Badge.svelte';
	import { kitchenOrders } from '$lib/data/demo';
	import { toasts } from '$lib/stores/toast';
</script>

<PageHeader
	title="Kitchen Display"
	description="Real-time kitchen order queue and status management"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Kitchen' }]}
/>

<div class="kitchen-grid">
	{#each ['pending', 'preparing', 'ready'] as status}
		<div class="kitchen-column">
			<h3 class="column-title">{status}
				<span class="column-count">{kitchenOrders.filter(o => o.status === status).length}</span>
			</h3>
			{#each kitchenOrders.filter(o => o.status === status) as order}
				<div class="kitchen-card" class:urgent={order.priority === 'high'}>
					<div class="card-header">
						<span class="order-id">{order.id}</span>
						{#if order.priority === 'high'}
							<Badge label="URGENT" variant="danger" />
						{/if}
					</div>
					<div class="card-items">
						{#each order.items as item}
							<div class="card-item">{item}</div>
						{/each}
					</div>
					<div class="card-footer">
						<span class="card-time">{order.time}</span>
						<button class="card-action" onclick={() => toasts.add(`${order.id} updated (demo)`, 'success')}>
							{status === 'pending' ? 'Start' : status === 'preparing' ? 'Ready' : 'Served'}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.kitchen-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-5);
		margin-top: var(--space-4);
	}
	.kitchen-column {
		background: var(--color-bg-alt);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		min-height: 400px;
	}
	.column-title {
		font-size: var(--font-size-base);
		text-transform: capitalize;
		margin-bottom: var(--space-4);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.column-count {
		background: var(--color-white);
		width: 24px; height: 24px;
		border-radius: var(--radius-full);
		display: inline-flex; align-items: center; justify-content: center;
		font-size: var(--font-size-xs);
	}
	.kitchen-card {
		background: var(--color-white);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-bottom: var(--space-3);
		box-shadow: var(--shadow-xs);
		border-left: 3px solid var(--color-border);
	}
	.kitchen-card.urgent { border-left-color: var(--color-danger); }
	.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
	.order-id { font-weight: var(--font-weight-bold); }
	.card-items { margin-bottom: var(--space-3); }
	.card-item { font-size: var(--font-size-sm); color: var(--color-text-secondary); padding: 2px 0; }
	.card-footer { display: flex; justify-content: space-between; align-items: center; }
	.card-time { font-size: var(--font-size-xs); color: var(--color-text-light); }
	.card-action {
		padding: var(--space-1) var(--space-3);
		background: var(--color-primary); color: white;
		border-radius: var(--radius-sm); font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}
	@media (max-width: 900px) {
		.kitchen-grid { grid-template-columns: 1fr; }
	}
</style>
