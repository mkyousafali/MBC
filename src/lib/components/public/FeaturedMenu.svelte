<script lang="ts">
	import { menuItems } from '$lib/data/demo';
	import FoodCard from '$lib/components/common/FoodCard.svelte';

	const featured = menuItems.filter(i => i.isPopular);
</script>

<section class="featured-menu" id="menu">
	<div class="section-container">
		<h2>Our Signature Menu</h2>
		<p class="section-subtitle">Taste the authentic Malabar flavours — freshly prepared every day</p>
		<div class="food-grid">
			{#each featured as item (item.id)}
				<FoodCard {item} />
			{/each}
		</div>
	</div>
</section>

<style>
	.featured-menu {
		padding: var(--space-16) var(--space-5);
		background: var(--color-white);
	}
	.section-container {
		max-width: var(--max-width);
		margin: 0 auto;
	}
	h2 {
		text-align: center;
		font-size: var(--font-size-3xl);
		color: var(--color-primary-dark);
		margin-bottom: var(--space-2);
	}
	.section-subtitle {
		text-align: center;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-10);
		font-size: var(--font-size-lg);
	}
	.food-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-6);
	}
</style>
