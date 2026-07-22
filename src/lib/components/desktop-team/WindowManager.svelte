<script lang="ts">
	export type WindowState = {
		id: string;
		title: string;
		icon: string;
		component: string;
		x: number;
		y: number;
		width: number;
		height: number;
		minWidth: number;
		minHeight: number;
		minimized: boolean;
		maximized: boolean;
		zIndex: number;
		prevBounds?: { x: number; y: number; width: number; height: number };
	};

	let windows = $state<WindowState[]>([]);
	let nextZ = $state(100);

	export function openWindow(id: string, title: string, icon: string, component: string) {
		const existing = windows.find(w => w.id === id);
		if (existing) {
			existing.minimized = false;
			bringToFront(id);
			return;
		}
		const offset = (windows.length % 8) * 30;
		windows.push({
			id,
			title,
			icon,
			component,
			x: 80 + offset,
			y: 40 + offset,
			width: 900,
			height: 600,
			minWidth: 400,
			minHeight: 300,
			minimized: false,
			maximized: false,
			zIndex: nextZ++
		});
	}

	export function closeWindow(id: string) {
		windows = windows.filter(w => w.id !== id);
	}

	export function minimizeWindow(id: string) {
		const w = windows.find(w => w.id === id);
		if (w) w.minimized = true;
	}

	export function toggleMaximize(id: string) {
		const w = windows.find(w => w.id === id);
		if (!w) return;
		if (w.maximized) {
			if (w.prevBounds) {
				w.x = w.prevBounds.x;
				w.y = w.prevBounds.y;
				w.width = w.prevBounds.width;
				w.height = w.prevBounds.height;
			}
			w.maximized = false;
		} else {
			w.prevBounds = { x: w.x, y: w.y, width: w.width, height: w.height };
			w.maximized = true;
		}
	}

	export function bringToFront(id: string) {
		const w = windows.find(w => w.id === id);
		if (w) w.zIndex = nextZ++;
	}

	export function restoreWindow(id: string) {
		const w = windows.find(w => w.id === id);
		if (w) {
			w.minimized = false;
			bringToFront(id);
		}
	}

	export function getWindows(): WindowState[] {
		return windows;
	}

	export function refreshWindow(id: string) {
		const w = windows.find(w => w.id === id);
		if (!w) return;
		const component = w.component;
		w.component = '';
		setTimeout(() => { w.component = component; }, 0);
	}
</script>
