<script lang="ts">
	import type { WindowState } from '$lib/stores/windows';
	import { closeWindow, minimizeWindow, toggleMaximize, bringToFront, refreshWindow, updateWindow } from '$lib/stores/windows';

	let { windowState, children }: { windowState: WindowState; children: any } = $props();

	let dragging = false;
	let resizing = false;
	let dragOffset = { x: 0, y: 0 };
	let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

	function onMouseDownTitlebar(e: MouseEvent) {
		if (windowState.maximized) return;
		dragging = true;
		dragOffset.x = e.clientX - windowState.x;
		dragOffset.y = e.clientY - windowState.y;
		bringToFront(windowState.id);
		window.addEventListener('mousemove', onDragMove);
		window.addEventListener('mouseup', onDragEnd);
	}

	function onDragMove(e: MouseEvent) {
		if (!dragging) return;
		e.preventDefault();
		updateWindow(windowState.id, {
			x: Math.max(0, e.clientX - dragOffset.x),
			y: Math.max(0, e.clientY - dragOffset.y)
		});
	}

	function onDragEnd() {
		dragging = false;
		window.removeEventListener('mousemove', onDragMove);
		window.removeEventListener('mouseup', onDragEnd);
	}

	function onResizeStart(e: MouseEvent) {
		if (windowState.maximized) return;
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		resizeStart = { x: e.clientX, y: e.clientY, w: windowState.width, h: windowState.height };
		bringToFront(windowState.id);
		window.addEventListener('mousemove', onResizeMove);
		window.addEventListener('mouseup', onResizeEnd);
	}

	function onResizeMove(e: MouseEvent) {
		if (!resizing) return;
		e.preventDefault();
		updateWindow(windowState.id, {
			width: Math.max(windowState.minWidth, resizeStart.w + (e.clientX - resizeStart.x)),
			height: Math.max(windowState.minHeight, resizeStart.h + (e.clientY - resizeStart.y))
		});
	}

	function onResizeEnd() {
		resizing = false;
		window.removeEventListener('mousemove', onResizeMove);
		window.removeEventListener('mouseup', onResizeEnd);
	}

	function onDoubleClickTitlebar() {
		toggleMaximize(windowState.id);
	}

	function onPopOut() {
		const url = `/team/desktop/window/${windowState.id}`;
		window.open(url, windowState.id, `width=${windowState.width},height=${windowState.height}`);
		closeWindow(windowState.id);
	}

	function onFocus() {
		bringToFront(windowState.id);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="desktop-window"
	class:maximized={windowState.maximized}
	class:minimized={windowState.minimized}
	style="left:{windowState.maximized ? 0 : windowState.x}px;top:{windowState.maximized ? 0 : windowState.y}px;width:{windowState.maximized ? '100%' : windowState.width + 'px'};height:{windowState.maximized ? '100%' : windowState.height + 'px'};z-index:{windowState.zIndex}"
	onmousedown={onFocus}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="window-titlebar" onmousedown={onMouseDownTitlebar} ondblclick={onDoubleClickTitlebar}>
		<div class="titlebar-left">
			<span class="window-icon">{windowState.icon}</span>
			<span class="window-title">{windowState.title}</span>
		</div>
		<div class="titlebar-actions">
			<button class="titlebar-btn refresh-btn" onclick={() => refreshWindow(windowState.id)} title="Refresh">⟳</button>
			<button class="titlebar-btn popout-btn" onclick={onPopOut} title="Pop out to new tab">⧉</button>
			<button class="titlebar-btn minimize-btn" onclick={() => minimizeWindow(windowState.id)} title="Minimize">−</button>
			<button class="titlebar-btn maximize-btn" onclick={() => toggleMaximize(windowState.id)} title={windowState.maximized ? 'Restore' : 'Maximize'}>
				{windowState.maximized ? '❐' : '□'}
			</button>
			<button class="titlebar-btn close-btn" onclick={() => closeWindow(windowState.id)} title="Close">✕</button>
		</div>
	</div>
	<div class="window-content">
		{@render children()}
	</div>
	{#if !windowState.maximized}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle" onmousedown={onResizeStart}></div>
	{/if}
</div>

<style>
	.desktop-window {
		position: absolute;
		background: var(--color-white);
		border-radius: 8px;
		box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition: box-shadow 0.15s;
	}
	.desktop-window.maximized {
		border-radius: 0;
	}
	.desktop-window.minimized {
		display: none;
	}
	.window-titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 38px;
		padding: 0 8px 0 12px;
		background: #C9A24D;
		border-bottom: 1px solid #A87A28;
		cursor: default;
		user-select: none;
		-webkit-user-select: none;
		flex-shrink: 0;
	}
	.titlebar-left {
		display: flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
	}
	.window-icon { font-size: 1rem; flex-shrink: 0; }
	.window-title {
		font-size: 13px;
		font-weight: 600;
		color: #FFFFFF;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.titlebar-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}
	.titlebar-btn {
		width: 32px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: 4px;
		font-size: 14px;
		color: rgba(255,255,255,0.85);
		transition: background 0.12s, color 0.12s;
	}
	.titlebar-btn:hover { background: rgba(255,255,255,0.2); color: #FFFFFF; }
	.close-btn:hover { background: #e81123; color: white; }
	.refresh-btn { font-size: 16px; }
	.window-content {
		flex: 1;
		overflow: auto;
		padding: 16px;
	}
	.resize-handle {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 16px;
		height: 16px;
		cursor: nwse-resize;
	}
	.resize-handle::after {
		content: '';
		position: absolute;
		bottom: 3px;
		right: 3px;
		width: 8px;
		height: 8px;
		border-right: 2px solid var(--color-text-light);
		border-bottom: 2px solid var(--color-text-light);
		opacity: 0.5;
	}
</style>
