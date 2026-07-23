<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import DesktopSidebar from '$lib/components/desktop-team/DesktopSidebar.svelte';
	import DesktopTaskbar from '$lib/components/desktop-team/DesktopTaskbar.svelte';
	import DesktopWindow from '$lib/components/desktop-team/DesktopWindow.svelte';
	import { windowsStore, sidebarCollapsed } from '$lib/stores/windows';
	import { teamUser, setPermissions } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';
	import UsersWindow from '$lib/components/desktop-team/windows/UsersWindow.svelte';
	import BranchesWindow from '$lib/components/desktop-team/windows/BranchesWindow.svelte';
	import PermissionsWindow from '$lib/components/desktop-team/windows/PermissionsWindow.svelte';
	import AuditLogsWindow from '$lib/components/desktop-team/windows/AuditLogsWindow.svelte';
	import HRMasterWindow from '$lib/components/desktop-team/windows/HRMasterWindow.svelte';
	import EmployeeShiftsWindow from '$lib/components/desktop-team/windows/EmployeeShiftsWindow.svelte';
	import SecurityCodeWindow from '$lib/components/desktop-team/windows/SecurityCodeWindow.svelte';
	import RawAttendanceWindow from '$lib/components/desktop-team/windows/RawAttendanceWindow.svelte';
	import ProductsWindow from '$lib/components/desktop-team/windows/ProductsWindow.svelte';
	import SuppliersWindow from '$lib/components/desktop-team/windows/SuppliersWindow.svelte';
	import POWindow from '$lib/components/desktop-team/windows/POWindow.svelte';

	let { children } = $props();

	const componentMap: Record<string, any> = {
		UsersWindow,
		BranchesWindow,
		PermissionsWindow,
		AuditLogsWindow,
		HRMasterWindow,
		EmployeeShiftsWindow,
		SecurityCodeWindow,
		RawAttendanceWindow,
		ProductsWindow,
		SuppliersWindow,
		POWindow
	};

	// Refresh permissions on page load and on window focus
	async function refreshPermissions() {
		let user: any = null;
		teamUser.subscribe(u => { user = u; })();
		if (!user || user.is_super_admin) return;
		try {
			const { data } = await supabase.rpc('rpc_get_my_permissions', { p_user_id: user.user_id });
			setPermissions(data || []);
		} catch {}
	}

	onMount(() => {
		refreshPermissions();
		if (browser) {
			window.addEventListener('focus', refreshPermissions);
			return () => window.removeEventListener('focus', refreshPermissions);
		}
	});
</script>

<svelte:head>
	<title>MBC One OS — Desktop Workspace</title>
</svelte:head>

<div class="desktop-layout">
	<DesktopSidebar />

	<main class="desktop-main" class:sidebar-collapsed={$sidebarCollapsed}>
		<!-- Desktop background / workspace area -->
		<div class="desktop-workspace">
			{#if $windowsStore.length === 0}
				{@render children()}
			{/if}
			{#each $windowsStore as w (w.id)}
				{@const Component = componentMap[w.component]}
				{#if Component}
					<DesktopWindow windowState={w}>
						<Component />
					</DesktopWindow>
				{/if}
			{/each}
		</div>
	</main>

	<DesktopTaskbar />
</div>

<style>
	.desktop-layout {
		min-height: 100vh;
		background: var(--color-bg);
		overflow: hidden;
	}
	.desktop-main {
		margin-left: var(--sidebar-width);
		height: calc(100vh - 48px);
		transition: margin-left var(--transition-normal);
		position: relative;
		overflow: hidden;
	}
	.desktop-workspace {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}
	.desktop-main.sidebar-collapsed {
		margin-left: var(--sidebar-collapsed-width);
	}
	@media (max-width: 1024px) {
		.desktop-main { margin-left: var(--sidebar-collapsed-width); }
	}
</style>
