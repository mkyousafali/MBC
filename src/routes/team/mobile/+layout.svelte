<script lang="ts">
	import { teamUser } from '$lib/stores/auth';

	let { children } = $props();
	let userName = $state('');
	teamUser.subscribe(u => { userName = u?.full_name || 'Team Member'; });
</script>

<svelte:head>
	<title>MBC One OS — Team Mobile</title>
</svelte:head>

<div class="team-mobile-layout">
	<!-- Top Bar -->
	<header class="top-bar">
		<span class="top-bar-name">{userName}</span>
		<a href="/team/mobile/notifications" class="top-bar-notif" title="Notifications">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
				<path d="M13.73 21a2 2 0 0 1-3.46 0"/>
			</svg>
		</a>
	</header>

	<main class="team-mobile-main">
		{@render children()}
	</main>

	<!-- Bottom Bar -->
	<nav class="bottom-bar">
		<a href="/team/mobile" class="bottom-btn active">
			<span class="bottom-icon">🏠</span>
			<span class="bottom-label">Home</span>
		</a>
	</nav>
</div>

<style>
	.team-mobile-layout {
		min-height: 100vh;
		background: #F8F8F5;
		display: flex;
		flex-direction: column;
	}

	/* Top Bar */
	.top-bar {
		position: sticky;
		top: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		background: #0E5A3C;
		color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	.top-bar-name {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.2px;
	}
	.top-bar-notif {
		color: white;
		display: flex;
		align-items: center;
		padding: 4px;
		border-radius: 6px;
		transition: background 0.2s;
	}
	.top-bar-notif:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	/* Main Content */
	.team-mobile-main {
		flex: 1;
		padding: 16px;
		padding-bottom: 72px;
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
