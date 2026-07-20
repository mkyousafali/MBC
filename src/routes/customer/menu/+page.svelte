<script lang="ts">
	import { menuItems, menuCategories } from '$lib/data/demo';
	import FoodCard from '$lib/components/common/FoodCard.svelte';

	let search = $state('');
	let activeCategory = $state('All');

	const filteredItems = $derived(
		menuItems.filter(i => {
			const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
			const matchesCategory = activeCategory === 'All' || i.category === activeCategory;
			return matchesSearch && matchesCategory;
		})
	);
</script>

<div class="menu-page">
	<div class="menu-header">
		<h1>Our Menu</h1>
		<div class="search-bar">
			<span>🔍</span>
			<input type="text" placeholder="Search dishes..." bind:value={search} />
		</div>
	</div>

	<div class="categories">
		{#each menuCategories as cat}
			<button class="cat-btn" class:active={activeCategory === cat} onclick={() => activeCategory = cat}>{cat}</button>
		{/each}
	</div>

	<div class="menu-grid">
		{#each filteredItems as item (item.id)}
			<FoodCard {item} />
		{:else}
			<p class="no-items">No items match your search.</p>
		{/each}
	</div>
</div>

<style>
	.menu-page { padding: var(--space-5); }
	.menu-header { margin-bottom: var(--space-4); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-3); }
	.search-bar {
		display: flex; align-items: center; gap: var(--space-2);
		background: var(--color-white); padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md); box-shadow: var(--shadow-xs);
	}
	.search-bar input { border: none; background: none; outline: none; width: 100%; font-size: var(--font-size-base); }
	.categories {
		display: flex; gap: var(--space-2); overflow-x: auto;
		padding-bottom: var(--space-3); margin-bottom: var(--space-4);
	}
	.categories::-webkit-scrollbar { display: none; }
	.cat-btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
		background: var(--color-white); color: var(--color-text-secondary);
		border: 1.5px solid var(--color-border); white-space: nowrap;
		transition: all var(--transition-fast);
	}
	.cat-btn.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
	.menu-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-4);
	}
	.no-items { text-align: center; color: var(--color-text-light); padding: var(--space-8); grid-column: 1 / -1; }
</style>
