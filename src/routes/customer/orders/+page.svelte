<script lang="ts">
	import { recentOrders } from '$lib/data/demo';
	import Badge from '$lib/components/common/Badge.svelte';

	function getBadgeVariant(status: string) {
		switch(status) {
			case 'delivered': return 'success' as const;
			case 'cancelled': return 'danger' as const;
			case 'preparing': return 'accent' as const;
			default: return 'warning' as const;
		}
	}
</script>

<div class="orders-page">
	<h1>My Orders</h1>

	<div class="orders-list">
		{#each recentOrders as order (order.id)}
			<div class="order-card">
				<div class="order-top">
					<div>
						<span class="order-id">{order.id}</span>
						<span class="order-date">{order.date} • {order.time}</span>
					</div>
					<Badge label={order.status} variant={getBadgeVariant(order.status)} />
				</div>
				<div class="order-items">
					{#each order.items as item}
						<div class="order-item">
							<span>{item.menuItem.name} × {item.quantity}</span>
							<span>₹{item.menuItem.price * item.quantity}</span>
						</div>
					{/each}
				</div>
				<div class="order-bottom">
					<span class="order-total">Total: ₹{order.total}</span>
					<button class="reorder-btn">Reorder</button>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.orders-page { padding: var(--space-5); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-5); }
	.orders-list { display: flex; flex-direction: column; gap: var(--space-4); }
	.order-card {
		background: var(--color-white); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm); overflow: hidden;
	}
	.order-top {
		display: flex; justify-content: space-between; align-items: flex-start;
		padding: var(--space-4) var(--space-4) var(--space-2);
	}
	.order-id { font-weight: var(--font-weight-semibold); display: block; }
	.order-date { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.order-items {
		padding: 0 var(--space-4);
		border-top: 1px solid var(--color-border-light);
		border-bottom: 1px solid var(--color-border-light);
	}
	.order-item {
		display: flex; justify-content: space-between;
		padding: var(--space-2) 0; font-size: var(--font-size-sm);
	}
	.order-bottom {
		display: flex; justify-content: space-between; align-items: center;
		padding: var(--space-3) var(--space-4);
	}
	.order-total { font-weight: var(--font-weight-bold); color: var(--color-primary); }
	.reorder-btn {
		padding: var(--space-2) var(--space-4);
		background: var(--color-primary-50); color: var(--color-primary);
		border-radius: var(--radius-md); font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold); transition: background var(--transition-fast);
	}
	.reorder-btn:hover { background: var(--color-primary-100); }
</style>
