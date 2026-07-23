<script lang="ts">
	import { openWindow, sidebarCollapsed } from '$lib/stores/windows';
	import { teamUser, userPermissions } from '$lib/stores/auth';

	let collapsed = $state(true);
	let currentUser = $state<{ full_name: string; username: string; is_super_admin: boolean } | null>(null);
	let perms = $state<any[]>([]);

	teamUser.subscribe(u => { currentUser = u; });
	userPermissions.subscribe(p => { perms = p; });

	$effect(() => {
		sidebarCollapsed.set(collapsed);
	});

	// Navigation registry — all possible items
	const navItems = [
		{ key: 'hr.management.master', section: 'HR', sub: 'Management', id: 'hr_master', title: 'Master', icon: '👤', component: 'HRMasterWindow' },
		{ key: 'hr.operations.employee_shifts', section: 'HR', sub: 'Operations', id: 'employee_shifts', title: 'Employee Shifts', icon: '🕰️', component: 'EmployeeShiftsWindow' },
		{ key: 'hr.operations.security_code', section: 'HR', sub: 'Operations', id: 'security_code', title: 'Security Code', icon: '🔐', component: 'SecurityCodeWindow' },
		{ key: 'hr.reports.raw_attendance', section: 'HR', sub: 'Reports', id: 'raw_attendance', title: 'Raw Attendance', icon: '📋', component: 'RawAttendanceWindow' },
		{ key: 'settings.management.users', section: 'Settings', sub: 'Management', id: 'users', title: 'Users', icon: '👥', component: 'UsersWindow' },
		{ key: 'settings.management.branches', section: 'Settings', sub: 'Management', id: 'branches', title: 'Branches', icon: '🏢', component: 'BranchesWindow' },
		{ key: 'settings.management.permissions', section: 'Settings', sub: 'Management', id: 'permissions', title: 'Permissions', icon: '🔐', component: 'PermissionsWindow' },
		{ key: 'settings.reports.audit_logs', section: 'Settings', sub: 'Reports', id: 'audit_logs', title: 'Audit Logs', icon: '📜', component: 'AuditLogsWindow' },
		{ key: 'inventory.manage.production', section: 'Inventory', sub: 'Manage', id: 'production', title: 'Products', icon: '📦', component: 'ProductsWindow' },
		{ key: 'inventory.manage.suppliers', section: 'Inventory', sub: 'Manage', id: 'suppliers', title: 'Suppliers', icon: '🚚', component: 'SuppliersWindow' },
		{ key: 'inventory.operations.po', section: 'Inventory', sub: 'Operations', id: 'po', title: 'Purchase Orders', icon: '📋', component: 'POWindow' }
	];

	// Build visible navigation tree from permissions (reactive via perms + currentUser)
	let visibleNav = $derived(buildNav(currentUser, perms));

	function buildNav(user: typeof currentUser, permList: any[]) {
		const sa = user?.is_super_admin === true;
		const visible = navItems.filter(item =>
			sa || permList.some(p => p.resource_key === item.key && p.can_view)
		);

		// Group by section → subsection
		const sectionMap = new Map<string, Map<string, typeof navItems>>();
		for (const item of visible) {
			if (!sectionMap.has(item.section)) sectionMap.set(item.section, new Map());
			const sub = sectionMap.get(item.section)!;
			if (!sub.has(item.sub)) sub.set(item.sub, []);
			sub.get(item.sub)!.push(item);
		}

		const result: { section: string; subs: { name: string; items: typeof navItems }[] }[] = [];
		for (const [section, subs] of sectionMap) {
			const subArr: { name: string; items: typeof navItems }[] = [];
			for (const [name, items] of subs) {
				subArr.push({ name, items });
			}
			result.push({ section, subs: subArr });
		}
		return result;
	}

	// Expand state
	let expandedSections = $state<Set<string>>(new Set());
	let expandedSubs = $state<Set<string>>(new Set());

	function toggleSection(s: string) {
		if (expandedSections.has(s)) expandedSections.delete(s);
		else expandedSections.add(s);
		expandedSections = new Set(expandedSections);
	}
	function toggleSub(s: string) {
		if (expandedSubs.has(s)) expandedSubs.delete(s);
		else expandedSubs.add(s);
		expandedSubs = new Set(expandedSubs);
	}

	function handleItemClick(id: string, title: string, icon: string, component: string) {
		openWindow(id, title, icon, component);
	}

	// Section icons
	const sectionIcons: Record<string, string> = { 'Settings': '⚙️', 'HR': '👔' };
</script>

<aside class="sidebar" class:collapsed>
	<div class="sidebar-top">
		<button class="toggle-switch" class:on={!collapsed} onclick={() => collapsed = !collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
			<span class="toggle-knob"></span>
		</button>
	</div>

	<nav class="sidebar-nav" aria-label="Sidebar navigation">
		{#each visibleNav as sec}
			<button class="sidebar-section" onclick={() => toggleSection(sec.section)}>
				<span class="sidebar-icon">{sectionIcons[sec.section] || '📁'}</span>
				{#if !collapsed}
					<span class="sidebar-label">{sec.section}</span>
					<span class="expand-arrow" class:expanded={expandedSections.has(sec.section)}>›</span>
				{/if}
			</button>

			{#if expandedSections.has(sec.section) && !collapsed}
				<div class="subsection-group">
					{#each sec.subs as sub}
						<button class="sidebar-subsection" onclick={() => toggleSub(sub.name)}>
							<span class="subsection-label">{sub.name}</span>
							<span class="expand-arrow" class:expanded={expandedSubs.has(sub.name)}>›</span>
						</button>

						{#if expandedSubs.has(sub.name)}
							<div class="subsection-items">
								{#each sub.items as item}
									<button class="sidebar-item" onclick={() => handleItemClick(item.id, item.title, item.icon, item.component)}>
										<span class="item-icon">{item.icon}</span>
										<span class="item-label">{item.title}</span>
									</button>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		{/each}

		{#if visibleNav.length === 0 && !collapsed}
			<p class="empty-hint">No permissions assigned</p>
		{/if}
	</nav>

	<div class="sidebar-footer">
		<span class="user-avatar">{(currentUser?.full_name || 'U')[0].toUpperCase()}</span>
		{#if !collapsed}
			<span class="user-name">{currentUser?.full_name || currentUser?.username || 'User'}</span>
		{/if}
	</div>
</aside>

<style>
	.sidebar {
		width: var(--sidebar-width);
		height: calc(100vh - 48px);
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
	.sidebar-top {
		display: flex;
		justify-content: flex-end;
		padding: 8px;
		border-bottom: 1px solid var(--color-border-light);
	}
	.toggle-switch {
		width: 40px;
		height: 22px;
		border-radius: 12px;
		background: #ccc;
		border: none;
		cursor: pointer;
		position: relative;
		transition: background 0.25s;
		padding: 0;
	}
	.toggle-switch.on {
		background: #0E5A3C;
	}
	.toggle-knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
		transition: transform 0.25s;
	}
	.toggle-switch.on .toggle-knob {
		transform: translateX(18px);
	}
	.sidebar-nav {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Section header (Settings) */
	.sidebar-section {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 10px 12px;
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: 600;
		border: none;
		background: none;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background 0.12s;
	}
	.sidebar-section:hover { background: var(--color-bg-alt); }
	.sidebar-icon { font-size: 1.1rem; flex-shrink: 0; width: 22px; text-align: center; }
	.sidebar-label { flex: 1; white-space: nowrap; }

	.expand-arrow {
		font-size: 14px;
		color: var(--color-text-light);
		transition: transform 0.15s;
		flex-shrink: 0;
	}
	.expand-arrow.expanded { transform: rotate(90deg); }

	.subsection-group {
		padding-left: 16px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	/* Subsection header (Management, Operations, Reports) */
	.sidebar-subsection {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border: none;
		background: none;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background 0.12s;
	}
	.sidebar-subsection:hover { background: var(--color-bg-alt); }
	.subsection-label { flex: 1; }

	.subsection-items {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding-left: 8px;
	}

	/* Individual item button (Users) */
	.sidebar-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: 13px;
		font-weight: 500;
		border: none;
		background: none;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: all 0.12s;
	}
	.sidebar-item:hover {
		background: var(--color-primary-50);
		color: var(--color-primary);
	}
	.item-icon { font-size: 0.95rem; flex-shrink: 0; }
	.item-label { white-space: nowrap; }

	.empty-hint {
		padding: 8px 12px;
		color: var(--color-text-light);
		font-size: 12px;
		font-style: italic;
	}

	@media (max-width: 1024px) {
		.sidebar { width: var(--sidebar-collapsed-width); }
		.sidebar-label, .subsection-group, .expand-arrow, .user-name { display: none; }
	}
	.sidebar-footer {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px;
		border-top: 1px solid var(--color-border-light);
		margin-top: auto;
	}
	.user-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #e6f0eb;
		color: #0E5A3C;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 12px;
		flex-shrink: 0;
	}
	.user-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
</style>
