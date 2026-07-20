<script lang="ts">
	import { currentCustomer, menuItems, offers, recentOrders } from '$lib/data/demo';
	import FoodCard from '$lib/components/common/FoodCard.svelte';
	import OfferCard from '$lib/components/common/OfferCard.svelte';
	import Badge from '$lib/components/common/Badge.svelte';

	let search = $state('');
	const categories = ['All', 'Biriyani', 'Meals', 'Combos', 'Starters'];
	let activeCategory = $state('All');

	const filteredItems = $derived(
		menuItems.filter(i => {
			const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
			const matchesCategory = activeCategory === 'All' || i.category === activeCategory;
			return matchesSearch && matchesCategory;
		}).slice(0, 4)
	);
</script>

<div class="customer-home">
	<div class="customer-header">
		<div class="header-top">
			<div>
				<span class="greeting">Good afternoon 👋</span>
				<h1>{currentCustomer.name}</h1>
			</div>
			<div class="loyalty-badge">
				<span>⭐</span>
				<span>{currentCustomer.loyaltyPoints} pts</span>
			</div>
		</div>
		<div class="search-container">
			<span class="search-icon">🔍</span>
			<input type="text" placeholder="Search menu items..." bind:value={search} class="search-input" />
		</div>
	</div>

	<section class="categories-section">
		<div class="categories-scroll">
			{#each categories as cat}
				<button
					class="category-chip"
					class:active={activeCategory === cat}
					onclick={() => activeCategory = cat}
				>{cat}</button>
			{/each}
		</div>
	</section>

	<section class="section">
		<div class="section-header">
			<h2>Featured Dishes</h2>
			<a href="/customer/menu" class="see-all">See all →</a>
		</div>
		<div class="food-grid">
			{#each filteredItems as item (item.id)}
				<FoodCard {item} />
			{/each}
		</div>
	</section>

	<section class="section">
		<div class="section-header">
			<h2>Current Offers</h2>
			<a href="/customer/offers" class="see-all">See all →</a>
		</div>
		<div class="offers-scroll">
			{#each offers as offer (offer.id)}
				<OfferCard {offer} />
			{/each}
		</div>
	</section>

	<section class="section">
		<div class="section-header">
			<h2>Recent Orders</h2>
			<a href="/customer/orders" class="see-all">See all →</a>
		</div>
		<div class="orders-list">
			{#each recentOrders as order (order.id)}
				<div class="order-card">
					<div class="order-info">
						<span class="order-id">{order.id}</span>
						<span class="order-date">{order.date} • {order.time}</span>
					</div>
					<div class="order-right">
						<span class="order-total">₹{order.total}</span>
						<Badge label={order.status} variant={order.status === 'delivered' ? 'success' : 'warning'} />
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="section">
		<div class="quick-links">
			<a href="/customer/profile" class="quick-link-card">
				<span>📍</span>
				<span>Saved Addresses</span>
				<span class="quick-count">{currentCustomer.addresses.length}</span>
			</a>
			<a href="/customer/profile" class="quick-link-card">
				<span>⭐</span>
				<span>Loyalty Points</span>
				<span class="quick-count">{currentCustomer.loyaltyPoints}</span>
			</a>
		</div>
	</section>
</div>

<style>
	.customer-home { padding: 0; }
	.customer-header {
		background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
		padding: var(--space-6) var(--space-5) var(--space-8);
		color: white;
		border-radius: 0 0 var(--radius-xl) var(--radius-xl);
	}
	.header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-5); }
	.greeting { font-size: var(--font-size-sm); opacity: 0.9; }
	h1 { font-size: var(--font-size-2xl); margin-top: var(--space-1); }
	.loyalty-badge {
		display: flex; align-items: center; gap: var(--space-1);
		background: rgba(255,255,255,0.2); padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-full); font-size: var(--font-size-sm);
	}
	.search-container {
		display: flex; align-items: center; gap: var(--space-2);
		background: white; border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
	}
	.search-icon { color: var(--color-text-light); }
	.search-input {
		border: none; background: none; outline: none; width: 100%;
		font-size: var(--font-size-base); color: var(--color-text);
	}
	.categories-section { padding: var(--space-4) var(--space-5) 0; }
	.categories-scroll {
		display: flex; gap: var(--space-2);
		overflow-x: auto; padding-bottom: var(--space-2);
		-webkit-overflow-scrolling: touch;
	}
	.categories-scroll::-webkit-scrollbar { display: none; }
	.category-chip {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
		background: var(--color-white); color: var(--color-text-secondary);
		border: 1.5px solid var(--color-border);
		white-space: nowrap;
		transition: all var(--transition-fast);
	}
	.category-chip.active {
		background: var(--color-primary); color: white; border-color: var(--color-primary);
	}
	.section { padding: var(--space-5); }
	.section-header {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: var(--space-4);
	}
	.section-header h2 { font-size: var(--font-size-xl); }
	.see-all { font-size: var(--font-size-sm); color: var(--color-primary); font-weight: var(--font-weight-medium); }
	.food-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-4);
	}
	.offers-scroll {
		display: flex; gap: var(--space-4); overflow-x: auto;
		padding-bottom: var(--space-2); -webkit-overflow-scrolling: touch;
	}
	.offers-scroll::-webkit-scrollbar { display: none; }
	.offers-scroll > :global(*) { min-width: 280px; flex-shrink: 0; }
	.orders-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.order-card {
		display: flex; justify-content: space-between; align-items: center;
		padding: var(--space-4); background: var(--color-white);
		border-radius: var(--radius-md); box-shadow: var(--shadow-xs);
	}
	.order-info { display: flex; flex-direction: column; gap: 2px; }
	.order-id { font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm); }
	.order-date { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.order-right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); }
	.order-total { font-weight: var(--font-weight-bold); color: var(--color-primary); }
	.quick-links {
		display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);
	}
	.quick-link-card {
		display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
		padding: var(--space-5); background: var(--color-white);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-xs);
		text-decoration: none; color: var(--color-text);
		transition: box-shadow var(--transition-fast);
	}
	.quick-link-card:hover { box-shadow: var(--shadow-md); }
	.quick-link-card span:first-child { font-size: 1.5rem; }
	.quick-link-card span:nth-child(2) { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
	.quick-count { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-primary); }
</style>
