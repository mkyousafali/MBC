<script lang="ts">
	import { windowsStore, restoreWindow, bringToFront } from '$lib/stores/windows';
	import { onMount } from 'svelte';

	let currentTime = $state(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));

	onMount(() => {
		const interval = setInterval(() => {
			currentTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
		}, 1000);
		return () => clearInterval(interval);
	});
</script>

<div class="desktop-taskbar">
	<div class="taskbar-windows">
		{#each $windowsStore as w (w.id)}
			<button
				class="taskbar-item"
				class:active={!w.minimized}
				class:minimized={w.minimized}
				onclick={() => {
					if (w.minimized) {
						restoreWindow(w.id);
					} else {
						bringToFront(w.id);
					}
				}}
				title={w.title}
			>
				<span class="taskbar-item-icon">{w.icon}</span>
				<span class="taskbar-item-label">{w.title}</span>
			</button>
		{/each}
	</div>

	<div class="taskbar-right">
		<span class="taskbar-time">
			{currentTime}
		</span>
	</div>
</div>

<style>
	.desktop-taskbar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 48px;
		background: rgba(201, 162, 77, 0.95);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		display: flex;
		align-items: center;
		z-index: 9999;
		padding: 0 8px;
		gap: 4px;
	}
	.taskbar-left {
		display: flex;
		align-items: center;
		padding: 0 8px;
	}
	.taskbar-brand {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 6px;
		cursor: default;
	}
	.taskbar-logo { height: 24px; width: auto; }
	.taskbar-windows {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		padding: 0 4px;
	}
	.taskbar-item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border: none;
		background: rgba(255,255,255,0.06);
		color: rgba(255,255,255,0.8);
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
		white-space: nowrap;
		transition: background 0.12s;
		max-width: 200px;
	}
	.taskbar-item:hover { background: rgba(255,255,255,0.12); }
	.taskbar-item.active {
		background: rgba(255,255,255,0.15);
		border-bottom: 2px solid #C9A24D;
	}
	.taskbar-item.minimized {
		opacity: 0.6;
	}
	.taskbar-item-icon { font-size: 14px; flex-shrink: 0; }
	.taskbar-item-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.taskbar-right {
		display: flex;
		align-items: center;
		padding: 0 12px;
	}
	.taskbar-time {
		color: rgba(255,255,255,0.8);
		font-size: 12px;
		font-weight: 500;
	}
</style>
