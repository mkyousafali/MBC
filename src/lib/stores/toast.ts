import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info' | 'warning';
	duration?: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);
	let nextId = 0;

	function add(message: string, type: Toast['type'] = 'info', duration = 3000) {
		const id = nextId++;
		update(toasts => [...toasts, { id, message, type, duration }]);
		if (duration > 0) {
			setTimeout(() => remove(id), duration);
		}
	}

	function remove(id: number) {
		update(toasts => toasts.filter(t => t.id !== id));
	}

	return { subscribe, add, remove };
}

export const toasts = createToastStore();
