import { writable, get } from 'svelte/store';
import { writeAuditLog } from '$lib/utils/audit';

export const sidebarCollapsed = writable(false);

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

let nextZ = 100;

export const windowsStore = writable<WindowState[]>([]);

export function openWindow(id: string, title: string, icon: string, component: string) {
	windowsStore.update(windows => {
		const existing = windows.find(w => w.id === id);
		if (existing) {
			existing.minimized = false;
			existing.zIndex = nextZ++;
			return [...windows];
		}
		writeAuditLog({ action: 'view' as any, resourceType: 'window', resourceId: id, resourceLabel: title });
		const offset = (windows.length % 8) * 30;
		return [...windows, {
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
		}];
	});
}

export function closeWindow(id: string) {
	windowsStore.update(windows => windows.filter(w => w.id !== id));
}

export function minimizeWindow(id: string) {
	windowsStore.update(windows => {
		const w = windows.find(w => w.id === id);
		if (w) w.minimized = true;
		return [...windows];
	});
}

export function toggleMaximize(id: string) {
	windowsStore.update(windows => {
		const w = windows.find(w => w.id === id);
		if (!w) return windows;
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
		return [...windows];
	});
}

export function bringToFront(id: string) {
	windowsStore.update(windows => {
		const w = windows.find(w => w.id === id);
		if (w) w.zIndex = nextZ++;
		return [...windows];
	});
}

export function restoreWindow(id: string) {
	windowsStore.update(windows => {
		const w = windows.find(w => w.id === id);
		if (w) {
			w.minimized = false;
			w.zIndex = nextZ++;
		}
		return [...windows];
	});
}

export function refreshWindow(id: string) {
	windowsStore.update(windows => {
		const w = windows.find(w => w.id === id);
		if (!w) return windows;
		const component = w.component;
		w.component = '';
		setTimeout(() => {
			windowsStore.update(wins => {
				const win = wins.find(x => x.id === id);
				if (win) win.component = component;
				return [...wins];
			});
		}, 0);
		return [...windows];
	});
}
export function updateWindow(id: string, updates: Partial<WindowState>) {
	windowsStore.update(windows => {
		const w = windows.find(x => x.id === id);
		if (w) Object.assign(w, updates);
		return [...windows];
	});
}