<script lang="ts">
	import DesktopSidebar from '$lib/components/desktop-team/DesktopSidebar.svelte';
	import DesktopTopbar from '$lib/components/desktop-team/DesktopTopbar.svelte';
	import type { NavItem } from '$lib/types';

	let { children } = $props();
	let sidebarCollapsed = $state(false);

	const sidebarItems: NavItem[] = [
		{ label: 'Dashboard', href: '/team/desktop', icon: '📊' },
		{ label: 'POS', href: '/team/desktop/pos', icon: '💳' },
		{ label: 'Orders', href: '/team/desktop/orders', icon: '📦' },
		{ label: 'Kitchen', href: '/team/desktop/kitchen', icon: '🍳' },
		{ label: 'Menu Management', href: '/team/desktop/menu', icon: '📋' },
		{ label: 'Inventory', href: '/team/desktop/inventory', icon: '📦' },
		{ label: 'Purchases', href: '/team/desktop/purchases', icon: '🛒' },
		{ label: 'Suppliers', href: '/team/desktop/suppliers', icon: '🤝' },
		{ label: 'Customers', href: '/team/desktop/customers', icon: '👥' },
		{ label: 'Loyalty', href: '/team/desktop/loyalty', icon: '⭐' },
		{ label: 'Employees', href: '/team/desktop/employees', icon: '🧑‍💼' },
		{ label: 'Attendance', href: '/team/desktop/attendance', icon: '📅' },
		{ label: 'Expenses', href: '/team/desktop/expenses', icon: '💰' },
		{ label: 'Reports', href: '/team/desktop/reports', icon: '📈' },
		{ label: 'Settings', href: '/team/desktop/settings', icon: '⚙️' }
	];
</script>

<svelte:head>
	<title>MBC One OS — Desktop Workspace</title>
</svelte:head>

<div class="desktop-layout">
	<DesktopSidebar items={sidebarItems} bind:collapsed={sidebarCollapsed} />
	<DesktopTopbar {sidebarCollapsed} />
	<main class="desktop-main" class:sidebar-collapsed={sidebarCollapsed}>
		{@render children()}
	</main>
</div>

<style>
	.desktop-layout {
		min-height: 100vh;
		background: var(--color-bg);
	}
	.desktop-main {
		margin-left: var(--sidebar-width);
		margin-top: var(--header-height);
		padding: var(--space-6);
		transition: margin-left var(--transition-normal);
		min-height: calc(100vh - var(--header-height));
	}
	.desktop-main.sidebar-collapsed {
		margin-left: var(--sidebar-collapsed-width);
	}
	@media (max-width: 1024px) {
		.desktop-main { margin-left: var(--sidebar-collapsed-width); }
	}
</style>
