<script lang="ts">
	import type { NavItem } from '$lib/types';
	import { page } from '$app/stores';

	let { items, collapsed = $bindable(false) }: {
		items: NavItem[];
		collapsed: boolean;
	} = $props();
</script>

<aside class="sidebar" class:collapsed>
	<div class="sidebar-header">
		<a href="/team/desktop" class="sidebar-brand">
			<img src="/App Logo.png" alt="MBC One OS" class="sidebar-logo" />
			{#if !collapsed}
				<span class="sidebar-title">MBC One OS</span>
			{/if}
		</a>
		<button class="collapse-btn" onclick={() => collapsed = !collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
			{collapsed ? '→' : '←'}
		</button>
	</div>

	<nav class="sidebar-nav" aria-label="Sidebar navigation">
		{#each items as item}
			<a
				href={item.href}
				class="sidebar-item"
				class:active={$page.url.pathname === item.href}
				title={collapsed ? item.label : ''}
			>
				<span class="sidebar-icon">{item.icon}</span>
				{#if !collapsed}
					<span class="sidebar-label">{item.label}</span>
				{/if}
			</a>
		{/each}
	</nav>
</aside>

<style>
	.sidebar {
		width: var(--sidebar-width);
		height: 100vh;
		position: fixed;
		top: 0;
		left: 0;
		background: var(--color-white);
		border-right: 1px solid var(--color-border-light);
		display: flex;
		flex-direction: column;
		z-index: 800;
		transition: width var(--transition-normal);
		overflow: hidden;
	}
	.sidebar.collapsed { width: var(--sidebar-collapsed-width); }
	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border-light);
		min-height: var(--header-height);
	}
	.sidebar-brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		text-decoration: none;
		overflow: hidden;
	}
	.sidebar-logo { height: 36px; width: auto; flex-shrink: 0; }
	.sidebar-title {
		font-weight: var(--font-weight-bold);
		font-size: var(--font-size-base);
		color: var(--color-primary);
		white-space: nowrap;
	}
	.collapse-btn {
		width: 28px; height: 28px;
		display: flex; align-items: center; justify-content: center;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}
	.collapse-btn:hover { background: var(--color-bg-alt); }
	.sidebar-nav {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sidebar-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		text-decoration: none;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}
	.sidebar-item:hover { background: var(--color-bg-alt); color: var(--color-text); }
	.sidebar-item.active {
		background: var(--color-primary-50);
		color: var(--color-primary);
		font-weight: var(--font-weight-semibold);
	}
	.sidebar-icon { font-size: 1.2rem; flex-shrink: 0; width: 24px; text-align: center; }

	@media (max-width: 1024px) {
		.sidebar { width: var(--sidebar-collapsed-width); }
		.sidebar-title, .sidebar-label { display: none; }
	}
</style>
