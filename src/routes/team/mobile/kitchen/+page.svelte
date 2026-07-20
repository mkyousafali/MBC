<script lang="ts">
	import { kitchenOrders } from '$lib/data/demo';
	import Badge from '$lib/components/common/Badge.svelte';
	import { toasts } from '$lib/stores/toast';
</script>

<div class="kitchen-page">
	<h1>🍳 Kitchen Queue</h1>
	<div class="queue-list">
		{#each kitchenOrders as order}
			<div class="queue-card" class:high-priority={order.priority === 'high'}>
				<div class="queue-top">
					<span class="queue-id">{order.id}</span>
					<div class="queue-badges">
						{#if order.priority === 'high'}
							<Badge label="URGENT" variant="danger" />
						{/if}
						<Badge
							label={order.status}
							variant={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'accent' : 'warning'}
						/>
					</div>
				</div>
				<div class="queue-items">
					{#each order.items as item}
						<div class="queue-item">• {item}</div>
					{/each}
				</div>
				<div class="queue-bottom">
					<span class="queue-time">{order.time}</span>
					<div class="queue-actions">
						{#if order.status === 'pending'}
							<button class="btn-start" onclick={() => toasts.add(`Started preparing ${order.id}`, 'info')}>Start</button>
						{:else if order.status === 'preparing'}
							<button class="btn-ready" onclick={() => toasts.add(`${order.id} marked as ready`, 'success')}>Mark Ready</button>
						{:else}
							<button class="btn-done" onclick={() => toasts.add(`${order.id} served`, 'success')}>Served</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.kitchen-page { padding: var(--space-5); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-5); }
	.queue-list { display: flex; flex-direction: column; gap: var(--space-4); }
	.queue-card {
		background: var(--color-white); border-radius: var(--radius-lg);
		padding: var(--space-4); box-shadow: var(--shadow-sm);
		border-left: 4px solid var(--color-border);
	}
	.queue-card.high-priority { border-left-color: var(--color-danger); }
	.queue-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
	.queue-id { font-weight: var(--font-weight-bold); font-size: var(--font-size-lg); }
	.queue-badges { display: flex; gap: var(--space-2); }
	.queue-items { margin-bottom: var(--space-3); }
	.queue-item { font-size: var(--font-size-sm); padding: var(--space-1) 0; color: var(--color-text-secondary); }
	.queue-bottom { display: flex; justify-content: space-between; align-items: center; }
	.queue-time { font-size: var(--font-size-xs); color: var(--color-text-light); }
	.queue-actions { display: flex; gap: var(--space-2); }
	.btn-start, .btn-ready, .btn-done {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md); font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold); color: white;
	}
	.btn-start { background: var(--color-info); }
	.btn-ready { background: var(--color-success); }
	.btn-done { background: var(--color-primary); }
</style>
