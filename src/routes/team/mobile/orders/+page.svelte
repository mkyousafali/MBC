<script lang="ts">
	import { kitchenOrders } from '$lib/data/demo';
	import Badge from '$lib/components/common/Badge.svelte';
	import { toasts } from '$lib/stores/toast';

	let filter = $state('all');
	const filtered = $derived(filter === 'all' ? kitchenOrders : kitchenOrders.filter(o => o.status === filter));
</script>

<div class="orders-page">
	<h1>Orders</h1>
	<div class="filters">
		{#each ['all', 'pending', 'preparing', 'ready'] as f}
			<button class="filter-btn" class:active={filter === f} onclick={() => filter = f}>{f}</button>
		{/each}
	</div>
	<div class="order-list">
		{#each filtered as order}
			<div class="order-card">
				<div class="order-top">
					<span class="order-id">{order.id}</span>
					<Badge
						label={order.status}
						variant={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'accent' : 'warning'}
					/>
				</div>
				<div class="order-items">
					{#each order.items as item}
						<span class="item">{item}</span>
					{/each}
				</div>
				<div class="order-bottom">
					<span class="order-time">{order.time}</span>
					<button class="action-btn" onclick={() => toasts.add(`Order ${order.id} updated (demo)`, 'success')}>Update Status</button>
				</div>
			</div>
		{:else}
			<p class="empty">No orders in this category</p>
		{/each}
	</div>
</div>

<style>
	.orders-page { padding: var(--space-5); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-4); }
	.filters { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); overflow-x: auto; }
	.filters::-webkit-scrollbar { display: none; }
	.filter-btn {
		padding: var(--space-2) var(--space-4); border-radius: var(--radius-full);
		font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
		background: var(--color-white); color: var(--color-text-secondary);
		border: 1.5px solid var(--color-border); text-transform: capitalize; white-space: nowrap;
	}
	.filter-btn.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
	.order-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.order-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-xs); padding: var(--space-4); }
	.order-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
	.order-id { font-weight: var(--font-weight-bold); }
	.order-items { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
	.item { font-size: var(--font-size-sm); color: var(--color-text-secondary); background: var(--color-bg); padding: 2px var(--space-2); border-radius: var(--radius-sm); }
	.order-bottom { display: flex; justify-content: space-between; align-items: center; }
	.order-time { font-size: var(--font-size-xs); color: var(--color-text-light); }
	.action-btn {
		padding: var(--space-2) var(--space-3); background: var(--color-primary);
		color: white; border-radius: var(--radius-md); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
	}
	.empty { text-align: center; color: var(--color-text-light); padding: var(--space-8); }
</style>
