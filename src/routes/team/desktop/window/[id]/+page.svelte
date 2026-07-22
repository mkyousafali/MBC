<script lang="ts">
	import { page } from '$app/stores';
	import UsersWindow from '$lib/components/desktop-team/windows/UsersWindow.svelte';
	import BranchesWindow from '$lib/components/desktop-team/windows/BranchesWindow.svelte';
	import PermissionsWindow from '$lib/components/desktop-team/windows/PermissionsWindow.svelte';
	import AuditLogsWindow from '$lib/components/desktop-team/windows/AuditLogsWindow.svelte';
	import HRMasterWindow from '$lib/components/desktop-team/windows/HRMasterWindow.svelte';
	import EmployeeShiftsWindow from '$lib/components/desktop-team/windows/EmployeeShiftsWindow.svelte';
	import SecurityCodeWindow from '$lib/components/desktop-team/windows/SecurityCodeWindow.svelte';

	const componentMap: Record<string, { component: any; title: string; icon: string }> = {
		users: { component: UsersWindow, title: 'Users', icon: '👥' },
		branches: { component: BranchesWindow, title: 'Branches', icon: '🏢' },
		permissions: { component: PermissionsWindow, title: 'Permissions', icon: '🔐' },
		audit_logs: { component: AuditLogsWindow, title: 'Audit Logs', icon: '📜' },
		hr_master: { component: HRMasterWindow, title: 'Master', icon: '👤' },
		employee_shifts: { component: EmployeeShiftsWindow, title: 'Employee Shifts', icon: '🕰️' },
		security_code: { component: SecurityCodeWindow, title: 'Security Code', icon: '🔐' }
	};

	const windowId = $derived($page.params.id);
	const windowInfo = $derived(windowId ? componentMap[windowId] : undefined);
</script>

<svelte:head>
	<title>{windowInfo?.title ?? 'Window'} — MBC One OS</title>
</svelte:head>

{#if windowInfo}
	{@const Component = windowInfo.component}
	<div class="popout-window">
		<Component />
	</div>
{:else}
	<div class="popout-window">
		<p>Window not found.</p>
	</div>
{/if}

<style>
	.popout-window {
		padding: 16px;
		min-height: 100vh;
		background: var(--color-white);
	}
</style>
