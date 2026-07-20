<script lang="ts">
	import { currentEmployee } from '$lib/data/demo';
	import { toasts } from '$lib/stores/toast';

	const moreItems = [
		{ icon: '👤', label: 'My Profile', action: () => toasts.add('Profile page (demo)', 'info') },
		{ icon: '📋', label: 'Attendance', action: () => toasts.add('Attendance feature (demo)', 'info') },
		{ icon: '📊', label: 'Reports', action: () => toasts.add('Reports feature (demo)', 'info') },
		{ icon: '📦', label: 'Inventory', action: () => toasts.add('Inventory feature (demo)', 'info') },
		{ icon: '🔔', label: 'Notifications', action: () => toasts.add('Notifications feature (demo)', 'info') },
		{ icon: '⚙️', label: 'Settings', action: () => toasts.add('Settings feature (demo)', 'info') },
		{ icon: '🖥️', label: 'Switch to Desktop', action: () => window.location.href = '/team/desktop' },
		{ icon: '🚪', label: 'Logout', action: () => { toasts.add('Logged out (demo)', 'info'); setTimeout(() => window.location.href = '/', 1000); } }
	];
</script>

<div class="more-page">
	<div class="more-header">
		<div class="avatar">{currentEmployee.name.charAt(0)}</div>
		<h1>{currentEmployee.name}</h1>
		<p>{currentEmployee.role} • {currentEmployee.shift}</p>
	</div>
	<div class="more-list">
		{#each moreItems as item}
			<button class="more-item" onclick={item.action}>
				<span class="more-icon">{item.icon}</span>
				<span class="more-label">{item.label}</span>
				<span class="more-arrow">→</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.more-page { padding: var(--space-5); }
	.more-header { text-align: center; padding: var(--space-6) 0; }
	.avatar {
		width: 64px; height: 64px; border-radius: var(--radius-full);
		background: var(--color-primary); color: white;
		font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold);
		display: flex; align-items: center; justify-content: center;
		margin: 0 auto var(--space-3);
	}
	h1 { font-size: var(--font-size-xl); }
	.more-header p { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
	.more-list {
		background: var(--color-white); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xs); overflow: hidden;
	}
	.more-item {
		display: flex; align-items: center; gap: var(--space-3);
		padding: var(--space-4) var(--space-5); width: 100%; text-align: left;
		border-bottom: 1px solid var(--color-border-light);
		transition: background var(--transition-fast);
	}
	.more-item:last-child { border-bottom: none; }
	.more-item:hover { background: var(--color-bg-alt); }
	.more-icon { font-size: 1.2rem; }
	.more-label { flex: 1; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
	.more-arrow { color: var(--color-text-light); }
</style>
