<script lang="ts">
	import { browser } from '$app/environment';
	import { clearTeamUser, teamUser } from '$lib/stores/auth';
	import { writeAuditLog } from '$lib/utils/audit';

	let online = $state(browser ? navigator.onLine : true);
	let currentUser = $state<{ full_name: string; username: string } | null>(null);

	teamUser.subscribe(u => { currentUser = u; });

	if (browser) {
		window.addEventListener('online', () => online = true);
		window.addEventListener('offline', () => online = false);
	}

	async function handleLogout() {
		await writeAuditLog({ action: 'logout', resourceType: 'session', resourceLabel: currentUser?.full_name || 'User' });
		clearTeamUser();
		window.location.href = '/';
	}
</script>

<div class="desktop-home">
	<div class="logo-card">
		<div class="card-top">
			<span class="version-badge">v0.1.0</span>
			<div class="top-right">
				<span class="status-dot" class:online title={online ? 'Online' : 'Offline'}></span>
				<button class="logout-btn" onclick={handleLogout} title="Logout">⏻</button>
			</div>
		</div>
		<div class="logos">
			<img src="/App Logo.png" alt="MBC One OS" class="home-logo" />
			<img src="/Logo.png" alt="Store Logo" class="home-logo" />
		</div>
	</div>
</div>

<style>
	.desktop-home {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: calc(100vh - 48px);
	}
	.logo-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 24px 80px;
		background: white;
		border-radius: 16px;
		box-shadow: 0 4px 24px rgba(0,0,0,0.08);
		border: 2px solid #C9A24D;
		user-select: none;
		position: relative;
	}
	.card-top {
		position: absolute;
		top: 12px;
		left: 16px;
		right: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.version-badge {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-light);
	}
	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #ef4444;
		flex-shrink: 0;
	}
	.status-dot.online {
		background: #22c55e;
	}
	.top-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.logout-btn {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--color-text-secondary);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.logout-btn:hover {
		background: #fde8e8;
		color: var(--color-danger);
	}
	.home-logo {
		height: 100px;
		width: auto;
	}
	.logos {
		display: flex;
		align-items: center;
		gap: 24px;
	}
</style>
