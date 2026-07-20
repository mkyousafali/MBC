<script lang="ts">
	import { notifications } from '$lib/data/demo';
	import { currentEmployee } from '$lib/data/demo';

	let { sidebarCollapsed = false }: { sidebarCollapsed?: boolean } = $props();
	let showNotifications = $state(false);
	let showProfile = $state(false);

	const unreadCount = notifications.filter(n => !n.read).length;
</script>

<header class="desktop-topbar" class:sidebar-collapsed={sidebarCollapsed}>
	<div class="topbar-left">
		<div class="search-bar">
			<span class="search-icon">🔍</span>
			<input type="text" placeholder="Search orders, menu, staff..." class="search-input" />
		</div>
	</div>

	<div class="topbar-right">
		<div class="branch-selector">
			<span>📍</span>
			<span class="branch-name">Main Branch — Kozhikode</span>
		</div>

		<div class="notification-wrapper">
			<button class="icon-btn" onclick={() => { showNotifications = !showNotifications; showProfile = false; }} aria-label="Notifications">
				🔔
				{#if unreadCount > 0}
					<span class="badge-count">{unreadCount}</span>
				{/if}
			</button>
			{#if showNotifications}
				<div class="dropdown notifications-dropdown">
					<h4>Notifications</h4>
					{#each notifications as notif (notif.id)}
						<div class="notif-item" class:unread={!notif.read}>
							<span class="notif-title">{notif.title}</span>
							<span class="notif-msg">{notif.message}</span>
							<span class="notif-time">{notif.time}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="profile-wrapper">
			<button class="profile-btn" onclick={() => { showProfile = !showProfile; showNotifications = false; }}>
				<span class="avatar">{currentEmployee.name.charAt(0)}</span>
				<span class="profile-name">{currentEmployee.name}</span>
			</button>
			{#if showProfile}
				<div class="dropdown profile-dropdown">
					<div class="profile-info">
						<strong>{currentEmployee.name}</strong>
						<span>{currentEmployee.role}</span>
					</div>
					<a href="/team/desktop/settings" class="dropdown-link">Settings</a>
					<a href="/" class="dropdown-link">Logout</a>
				</div>
			{/if}
		</div>
	</div>
</header>

<style>
	.desktop-topbar {
		position: fixed;
		top: 0;
		right: 0;
		left: var(--sidebar-width);
		height: var(--header-height);
		background: var(--color-white);
		border-bottom: 1px solid var(--color-border-light);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-6);
		z-index: 700;
		transition: left var(--transition-normal);
	}
	.desktop-topbar.sidebar-collapsed { left: var(--sidebar-collapsed-width); }
	.topbar-left { flex: 1; max-width: 500px; }
	.search-bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-4);
	}
	.search-icon { font-size: var(--font-size-sm); }
	.search-input {
		border: none;
		background: none;
		outline: none;
		width: 100%;
		font-size: var(--font-size-sm);
	}
	.topbar-right {
		display: flex;
		align-items: center;
		gap: var(--space-5);
	}
	.branch-selector {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--color-bg);
	}
	.branch-name { white-space: nowrap; }
	.icon-btn {
		position: relative;
		width: 40px; height: 40px;
		display: flex; align-items: center; justify-content: center;
		border-radius: var(--radius-full);
		transition: background var(--transition-fast);
		font-size: 1.2rem;
	}
	.icon-btn:hover { background: var(--color-bg-alt); }
	.badge-count {
		position: absolute;
		top: 2px; right: 2px;
		width: 18px; height: 18px;
		background: var(--color-danger);
		color: white;
		font-size: 10px;
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-full);
		display: flex; align-items: center; justify-content: center;
	}
	.profile-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1);
		border-radius: var(--radius-full);
		transition: background var(--transition-fast);
	}
	.profile-btn:hover { background: var(--color-bg-alt); }
	.avatar {
		width: 36px; height: 36px;
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: white;
		display: flex; align-items: center; justify-content: center;
		font-weight: var(--font-weight-bold);
		font-size: var(--font-size-sm);
	}
	.profile-name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}
	.notification-wrapper, .profile-wrapper { position: relative; }
	.dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-2);
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl);
		border: 1px solid var(--color-border-light);
		z-index: 1000;
		animation: fadeIn 150ms ease;
	}
	.notifications-dropdown {
		width: 320px;
		max-height: 400px;
		overflow-y: auto;
		padding: var(--space-4);
	}
	.notifications-dropdown h4 {
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-3);
		color: var(--color-text-secondary);
	}
	.notif-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		transition: background var(--transition-fast);
	}
	.notif-item:hover { background: var(--color-bg-alt); }
	.notif-item.unread { background: var(--color-primary-50); }
	.notif-title { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
	.notif-msg { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.notif-time { font-size: var(--font-size-xs); color: var(--color-text-light); }
	.profile-dropdown {
		width: 200px;
		padding: var(--space-3);
	}
	.profile-info {
		display: flex;
		flex-direction: column;
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-light);
	}
	.profile-info strong { font-size: var(--font-size-sm); }
	.profile-info span { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.dropdown-link {
		display: block;
		padding: var(--space-2) var(--space-3);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}
	.dropdown-link:hover { background: var(--color-bg-alt); }

	@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

	@media (max-width: 1024px) {
		.desktop-topbar { left: var(--sidebar-collapsed-width); }
		.branch-selector, .profile-name { display: none; }
	}
</style>
