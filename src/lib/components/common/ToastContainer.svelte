<script lang="ts">
	import { toasts } from '$lib/stores/toast';

	const toastList = $derived($toasts);
</script>

{#if toastList.length > 0}
	<div class="toast-container" aria-live="polite">
		{#each toastList as toast (toast.id)}
			<div class="toast toast-{toast.type}" role="alert">
				<span class="toast-icon">
					{#if toast.type === 'success'}✓{:else if toast.type === 'error'}✕{:else if toast.type === 'warning'}⚠{:else}ℹ{/if}
				</span>
				<span class="toast-message">{toast.message}</span>
				<button class="toast-close" onclick={() => toasts.remove(toast.id)} aria-label="Close notification">✕</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: var(--space-4);
		right: var(--space-4);
		z-index: 10000;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 400px;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		background: var(--color-white);
		box-shadow: var(--shadow-lg);
		border-left: 4px solid;
		animation: slideIn var(--transition-normal) ease;
	}
	.toast-success { border-left-color: var(--color-success); }
	.toast-error { border-left-color: var(--color-danger); }
	.toast-warning { border-left-color: var(--color-warning); }
	.toast-info { border-left-color: var(--color-info); }
	.toast-icon { font-size: var(--font-size-lg); flex-shrink: 0; }
	.toast-message { flex: 1; font-size: var(--font-size-sm); }
	.toast-close {
		background: none; border: none; cursor: pointer;
		color: var(--color-text-light); font-size: var(--font-size-sm);
		padding: var(--space-1);
	}
	.toast-close:hover { color: var(--color-text); }
	@keyframes slideIn {
		from { transform: translateX(100%); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}
</style>
