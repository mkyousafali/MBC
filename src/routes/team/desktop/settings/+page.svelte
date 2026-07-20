<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import { toasts } from '$lib/stores/toast';

	const sections = [
		{ icon: '🏢', title: 'Business Profile', desc: 'Restaurant name, address and contact details' },
		{ icon: '🍽️', title: 'Menu Settings', desc: 'Categories, pricing rules and availability' },
		{ icon: '🔔', title: 'Notifications', desc: 'Alert preferences and notification channels' },
		{ icon: '👥', title: 'Roles & Permissions', desc: 'Staff roles and access control' },
		{ icon: '💳', title: 'Payment Methods', desc: 'Accepted payment options and POS settings' },
		{ icon: '🖨️', title: 'Printing', desc: 'Receipt and kitchen order ticket settings' },
		{ icon: '🌐', title: 'Integrations', desc: 'Third-party service connections' },
		{ icon: '🔒', title: 'Security', desc: 'Password policies and login settings' }
	];
</script>

<PageHeader
	title="Settings"
	description="Configure your restaurant management system"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Settings' }]}
/>
<div class="settings-grid">
	{#each sections as section}
		<button class="settings-card" onclick={() => toasts.add(`${section.title} settings (demo)`, 'info')}>
			<span class="settings-icon">{section.icon}</span>
			<div>
				<h3>{section.title}</h3>
				<p>{section.desc}</p>
			</div>
			<span class="settings-arrow">→</span>
		</button>
	{/each}
</div>

<style>
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: var(--space-4);
	}
	.settings-card {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xs);
		text-align: left;
		transition: all var(--transition-fast);
		width: 100%;
	}
	.settings-card:hover { box-shadow: var(--shadow-md); }
	.settings-icon { font-size: 1.5rem; flex-shrink: 0; }
	.settings-card div { flex: 1; }
	.settings-card h3 { font-size: var(--font-size-base); margin-bottom: 2px; }
	.settings-card p { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
	.settings-arrow { color: var(--color-text-light); font-size: var(--font-size-lg); }
</style>
