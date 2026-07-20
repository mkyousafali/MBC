<script lang="ts">
	let { onLoginClick, onTeamLoginClick }: {
		onLoginClick: () => void;
		onTeamLoginClick: () => void;
	} = $props();

	let mobileMenuOpen = $state(false);

	const navLinks = [
		{ label: 'Home', href: '#home' },
		{ label: 'Menu', href: '#menu' },
		{ label: 'Offers', href: '#offers' },
		{ label: 'About', href: '#about' },
		{ label: 'Contact', href: '#contact' }
	];
</script>

<header class="public-header">
	<div class="header-container">
		<a href="/" class="logo-area">
			<img src="/Logo.png" alt="Malabar Biriyani Center" class="logo-img" />
			<div class="logo-text">
				<span class="brand-name">Malabar Biriyani Center</span>
			</div>
		</a>

		<nav class="desktop-nav" aria-label="Main navigation">
			{#each navLinks as link}
				<a href={link.href} class="nav-link">{link.label}</a>
			{/each}
		</nav>

		<div class="header-actions">
			<button class="btn-team" onclick={onTeamLoginClick}>Team Login</button>
			<button class="btn-customer" onclick={onLoginClick}>Login / Register</button>
		</div>

		<button
			class="hamburger"
			onclick={() => mobileMenuOpen = !mobileMenuOpen}
			aria-label="Toggle menu"
			aria-expanded={mobileMenuOpen}
		>
			<span class="hamburger-line" class:open={mobileMenuOpen}></span>
			<span class="hamburger-line" class:open={mobileMenuOpen}></span>
			<span class="hamburger-line" class:open={mobileMenuOpen}></span>
		</button>
	</div>

	{#if mobileMenuOpen}
		<div class="mobile-menu">
			<nav aria-label="Mobile navigation">
				{#each navLinks as link}
					<a href={link.href} class="mobile-link" onclick={() => mobileMenuOpen = false}>{link.label}</a>
				{/each}
			</nav>
			<div class="mobile-actions">
				<button class="btn-customer full" onclick={() => { mobileMenuOpen = false; onLoginClick(); }}>Login / Register</button>
				<button class="btn-team full" onclick={() => { mobileMenuOpen = false; onTeamLoginClick(); }}>Team Login</button>
			</div>
		</div>
	{/if}
</header>

<style>
	.public-header {
		position: sticky;
		top: 0;
		z-index: 1000;
		background: var(--color-white);
		box-shadow: var(--shadow-sm);
	}
	.header-container {
		max-width: var(--max-width);
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-5);
		gap: var(--space-4);
	}
	.logo-area {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		text-decoration: none;
		flex-shrink: 0;
	}
	.logo-img { height: 44px; width: auto; }
	.brand-name {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		white-space: nowrap;
	}
	.desktop-nav {
		display: flex;
		gap: var(--space-6);
	}
	.nav-link {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		transition: color var(--transition-fast);
		white-space: nowrap;
	}
	.nav-link:hover { color: var(--color-primary); }
	.header-actions { display: flex; gap: var(--space-3); align-items: center; }
	.btn-customer {
		background: var(--color-primary);
		color: white;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-sm);
		transition: background var(--transition-fast);
		white-space: nowrap;
	}
	.btn-customer:hover { background: var(--color-primary-light); }
	.btn-team {
		color: var(--color-primary);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-weight: var(--font-weight-medium);
		font-size: var(--font-size-sm);
		border: 1.5px solid var(--color-primary);
		background: transparent;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}
	.btn-team:hover { background: var(--color-primary-50); }
	.full { width: 100%; }
	.hamburger {
		display: none;
		flex-direction: column;
		gap: 5px;
		padding: var(--space-2);
		cursor: pointer;
	}
	.hamburger-line {
		width: 24px;
		height: 2px;
		background: var(--color-text);
		transition: all var(--transition-fast);
		border-radius: 2px;
	}
	.hamburger-line.open:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
	.hamburger-line.open:nth-child(2) { opacity: 0; }
	.hamburger-line.open:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }
	.mobile-menu {
		display: none;
		padding: var(--space-4) var(--space-5) var(--space-6);
		background: var(--color-white);
		border-top: 1px solid var(--color-border-light);
		animation: slideDown 200ms ease;
	}
	.mobile-menu nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}
	.mobile-link {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-weight: var(--font-weight-medium);
		transition: background var(--transition-fast);
	}
	.mobile-link:hover { background: var(--color-bg-alt); }
	.mobile-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (max-width: 768px) {
		.desktop-nav, .header-actions { display: none; }
		.hamburger, .mobile-menu { display: flex; }
		.logo-text .brand-name { font-size: var(--font-size-base); }
	}
</style>
