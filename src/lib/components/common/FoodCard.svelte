<script lang="ts">
	import type { MenuItem } from '$lib/types';
	import { toasts } from '$lib/stores/toast';
	import Button from './Button.svelte';

	let { item }: { item: MenuItem } = $props();

	function handleAdd() {
		toasts.add(`${item.name} added to cart`, 'success');
	}
</script>

<div class="food-card">
	<div class="food-image" class:veg={item.isVeg}>
		<span class="food-emoji">🍛</span>
		{#if item.isPopular}
			<span class="popular-badge">Popular</span>
		{/if}
		{#if item.isVeg}
			<span class="veg-badge">🟢 Veg</span>
		{/if}
	</div>
	<div class="food-info">
		<h3>{item.name}</h3>
		<p>{item.description}</p>
		<div class="food-footer">
			<span class="food-price">₹{item.price}</span>
			<Button variant="primary" size="sm" onclick={handleAdd}>Add +</Button>
		</div>
	</div>
</div>

<style>
	.food-card {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: all var(--transition-fast);
	}
	.food-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
	.food-image {
		height: 160px;
		background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100));
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}
	.food-image.veg {
		background: linear-gradient(135deg, #E8F5E9, #C8E6C9);
	}
	.food-emoji { font-size: 3.5rem; }
	.popular-badge {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		background: var(--color-accent);
		color: white;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}
	.veg-badge {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		background: white;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
	}
	.food-info { padding: var(--space-4); }
	.food-info h3 { font-size: var(--font-size-base); margin-bottom: var(--space-1); }
	.food-info p {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-bottom: var(--space-3);
	}
	.food-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.food-price {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
	}
</style>
