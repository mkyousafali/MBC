<script lang="ts">
	import BottomNav from '$lib/components/common/BottomNav.svelte';

	let { children } = $props();

	const navItems = [
		{ label: 'Home', href: '/customer', icon: '🏠' },
		{ label: 'Menu', href: '/customer/menu', icon: '🍽️' },
		{ label: 'Orders', href: '/customer/orders', icon: '📦' },
		{ label: 'Offers', href: '/customer/offers', icon: '🏷️' },
		{ label: 'Profile', href: '/customer/profile', icon: '👤' }
	];
</script>

<svelte:head>
	<title>MBC — Customer</title>
</svelte:head>

<div class="customer-layout">
	<main class="customer-main">
		{@render children()}
	</main>
	<BottomNav items={navItems} />
</div>

<style>
	.customer-layout {
		min-height: 100vh;
		background: var(--color-bg);
	}
	.customer-main {
		padding-bottom: calc(var(--bottom-nav-height) + var(--space-4));
	}
</style>
