<script lang="ts">
	import { teamUser, userPermissions } from '$lib/stores/auth';

	let isSA = $state(false);
	let canViewUsers = $state(false);
	let canViewShifts = $state(false);
	let canViewProducts = $state(false);
	let canViewSuppliers = $state(false);
	let canViewPO = $state(false);

	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === 'settings.management.users');
		canViewUsers = isSA || (r?.can_view ?? false);
		const s = p.find((x: any) => x.resource_key === 'hr.operations.employee_shifts');
		canViewShifts = isSA || (s?.can_view ?? false);
		const pr = p.find((x: any) => x.resource_key === 'inventory.manage.production');
		canViewProducts = isSA || (pr?.can_view ?? false);
		const su = p.find((x: any) => x.resource_key === 'inventory.manage.suppliers');
		canViewSuppliers = isSA || (su?.can_view ?? false);
		const po = p.find((x: any) => x.resource_key === 'inventory.operations.po');
		canViewPO = isSA || (po?.can_view ?? false);
	});

	type MenuItem = { label: string; icon: string; href: string; visible: boolean };

	let menuItems = $derived<MenuItem[]>([
		{ label: 'Users', icon: '👥', href: '/team/mobile/masters/users', visible: canViewUsers },
		{ label: 'Employee Shifts', icon: '🕐', href: '/team/mobile/masters/shifts', visible: canViewShifts },
		{ label: 'Products', icon: '📦', href: '/team/mobile/masters/products', visible: canViewProducts },
		{ label: 'Suppliers', icon: '🚚', href: '/team/mobile/masters/suppliers', visible: canViewSuppliers },
		{ label: 'Purchase Orders', icon: '📋', href: '/team/mobile/masters/po', visible: canViewPO }
	].filter(m => m.visible));
</script>

<div class="masters-page">
	{#if menuItems.length === 0}
		<div class="empty">
			<p>No access to any master modules.</p>
		</div>
	{:else}
		<div class="menu-grid">
			{#each menuItems as item}
				<a href={item.href} class="menu-card">
					<span class="menu-icon">{item.icon}</span>
					<span class="menu-label">{item.label}</span>
					<svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.masters-page { padding: 16px; }
	.empty { text-align: center; padding: 60px 20px; color: #888; font-size: 14px; }

	.menu-grid { display: flex; flex-direction: column; gap: 10px; }

	.menu-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		background: white;
		border-radius: 12px;
		text-decoration: none;
		color: #333;
		box-shadow: 0 1px 4px rgba(0,0,0,0.08);
		transition: background 0.15s;
	}
	.menu-card:active { background: #f0f0f0; }

	.menu-icon { font-size: 24px; }
	.menu-label { flex: 1; font-size: 15px; font-weight: 600; }
	.menu-arrow { color: #ccc; }
</style>
