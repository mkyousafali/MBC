<script lang="ts">
	import { teamUser, clearTeamUser, userPermissions } from '$lib/stores/auth';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { children } = $props();
	let userName = $state('');
	let currentPath = $state('');
	let isSA = $state(false);
	let showMasters = $state(false);

	const MASTERS_KEYS = ['settings.management.users', 'hr.operations.employee_shifts', 'inventory.manage.production', 'inventory.manage.suppliers', 'inventory.operations.po'];

	teamUser.subscribe(u => {
		userName = u?.full_name || 'Team Member';
		isSA = u?.is_super_admin === true;
	});
	page.subscribe(p => { currentPath = p.url.pathname; });
	userPermissions.subscribe(perms => {
		showMasters = isSA || perms.some((p: any) => MASTERS_KEYS.includes(p.resource_key) && p.can_view);
	});

	let pageTitle = $derived.by(() => {
		if (currentPath === '/team/mobile') return 'Dashboard';
		if (currentPath === '/team/mobile/masters') return 'Masters';
		if (currentPath.includes('/masters/users')) return 'Users';
		if (currentPath.includes('/masters/shifts')) return 'Employee Shifts';
		if (currentPath.includes('/masters/products')) return 'Products';
		if (currentPath.includes('/masters/suppliers')) return 'Suppliers';
		if (currentPath.includes('/masters/po')) return 'Purchase Orders';
		if (currentPath.includes('/notifications')) return 'Notifications';
		return 'Team Portal';
	});

	function goBack() {
		history.back();
	}

	function logout() {
		if (confirm('Are you sure you want to logout?')) {
			clearTeamUser();
			goto('/');
		}
	}
</script>

<svelte:head>
	<title>MBC One OS — Team Mobile</title>
</svelte:head>

<div class="team-mobile-layout">
	<!-- Top Bar -->
	<header class="top-bar">
		<div class="top-bar-left">
			{#if currentPath !== '/team/mobile'}
				<button class="back-btn" onclick={goBack}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
				</button>
			{/if}
			<div class="top-bar-titles">
				<span class="top-bar-page">{pageTitle}</span>
				<span class="top-bar-user">{userName}</span>
			</div>
		</div>
		<div class="top-bar-right">
			<a href="/team/mobile" class="top-bar-icon" class:active={currentPath === '/team/mobile'} title="Home">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
					<polyline points="9 22 9 12 15 12 15 22"/>
				</svg>
			</a>
			{#if showMasters}
				<a href="/team/mobile/masters" class="top-bar-icon" class:active={currentPath.startsWith('/team/mobile/masters')} title="Masters">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="16" y1="13" x2="8" y2="13"/>
						<line x1="16" y1="17" x2="8" y2="17"/>
						<polyline points="10 9 9 9 8 9"/>
					</svg>
				</a>
			{/if}
			<a href="/team/mobile/notifications" class="top-bar-icon" class:active={currentPath.includes('/notifications')} title="Notifications">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
					<path d="M13.73 21a2 2 0 0 1-3.46 0"/>
				</svg>
			</a>
			<button class="top-bar-icon" title="Logout" onclick={logout}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
					<polyline points="16 17 21 12 16 7"/>
					<line x1="21" y1="12" x2="9" y2="12"/>
				</svg>
			</button>
		</div>
	</header>

	<main class="team-mobile-main">
		{@render children()}
	</main>
</div>

<style>
	.team-mobile-layout {
		height: 100vh;
		background: #F8F8F5;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Top Bar */
	.top-bar {
		flex-shrink: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		background: #0E5A3C;
		color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	.top-bar-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.back-btn {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		border-radius: 6px;
		transition: background 0.2s;
	}
	.back-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}
	.top-bar-titles {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.top-bar-page {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: 0.2px;
		line-height: 1.2;
	}
	.top-bar-user {
		font-size: 11px;
		opacity: 0.85;
		font-weight: 400;
		line-height: 1.2;
	}
	.top-bar-right {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.top-bar-icon {
		color: white;
		background: none;
		border: none;
		display: flex;
		align-items: center;
		padding: 6px;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s;
		text-decoration: none;
	}
	.top-bar-icon:hover {
		background: rgba(255, 255, 255, 0.15);
	}
	.top-bar-icon.active {
		background: rgba(255, 255, 255, 0.25);
	}

	/* Main Content */
	.team-mobile-main {
		flex: 1;
		overflow: hidden;
		padding-bottom: 0;
	}

	/* Bottom Bar */
	.bottom-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px 16px;
		background: white;
		border-top: 1px solid #e0e0e0;
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
	}
	.bottom-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 20px;
		border-radius: 8px;
		text-decoration: none;
		color: #666;
		transition: all 0.2s;
	}
	.bottom-btn.active {
		color: #0E5A3C;
		background: rgba(14, 90, 60, 0.08);
	}
	.bottom-icon {
		font-size: 20px;
	}
	.bottom-label {
		font-size: 11px;
		font-weight: 600;
	}
</style>
