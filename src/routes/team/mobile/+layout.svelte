<script lang="ts">
	import BottomNav from '$lib/components/common/BottomNav.svelte';

	let { children } = $props();

	const navItems = [
		{ label: 'Dashboard', href: '/team/mobile', icon: '📊' },
		{ label: 'Orders', href: '/team/mobile/orders', icon: '📦' },
		{ label: 'Kitchen', href: '/team/mobile/kitchen', icon: '🍳' },
		{ label: 'Tasks', href: '/team/mobile/tasks', icon: '✅' },
		{ label: 'More', href: '/team/mobile/more', icon: '☰' }
	];
</script>

<svelte:head>
	<title>MBC One OS — Team Mobile</title>
</svelte:head>

<div class="team-mobile-layout">
	<main class="team-mobile-main">
		{@render children()}
	</main>
	<BottomNav items={navItems} />
</div>

<style>
	.team-mobile-layout {
		min-height: 100vh;
		background: var(--color-bg);
	}
	.team-mobile-main {
		padding-bottom: calc(var(--bottom-nav-height) + var(--space-4));
	}
</style>
