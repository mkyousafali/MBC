<script lang="ts">
	import type { NavItem } from '$lib/types';
	import { page } from '$app/stores';

	let { items }: { items: NavItem[] } = $props();
</script>

<nav class="bottom-nav" aria-label="Bottom navigation">
	{#each items as item}
		<a
			href={item.href}
			class="bottom-nav-item"
			class:active={$page.url.pathname === item.href || $page.url.pathname.startsWith(item.href + '/')}
			aria-current={$page.url.pathname === item.href ? 'page' : undefined}
		>
			<span class="nav-icon">{item.icon}</span>
			<span class="nav-label">{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: var(--bottom-nav-height);
		background: var(--color-white);
		border-top: 1px solid var(--color-border-light);
		display: flex;
		align-items: center;
		justify-content: space-around;
		z-index: 900;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
	}
	.bottom-nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		text-decoration: none;
		transition: color var(--transition-fast);
		border-radius: var(--radius-md);
		min-width: 56px;
	}
	.bottom-nav-item:hover { color: var(--color-primary); }
	.bottom-nav-item.active { color: var(--color-primary); font-weight: var(--font-weight-semibold); }
	.nav-icon { font-size: 1.4rem; }
	.nav-label { font-size: var(--font-size-xs); }
</style>
