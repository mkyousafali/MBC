<script lang="ts">
	let { open = $bindable(false), title = '', size = 'md', children, onclose }: {
		open: boolean; title?: string; size?: 'sm' | 'md' | 'lg';
		children: any; onclose?: () => void;
	} = $props();

	function handleClose() {
		open = false;
		onclose?.();
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) handleClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdrop} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label={title}>
		<div class="modal modal-{size}">
			{#if title}
				<div class="modal-header">
					<h2>{title}</h2>
					<button class="modal-close" onclick={handleClose} aria-label="Close">✕</button>
				</div>
			{/if}
			<div class="modal-body">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 5000;
		padding: var(--space-4);
		animation: fadeIn 200ms ease;
	}
	.modal {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl);
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		animation: scaleIn 200ms ease;
	}
	.modal-sm { max-width: 400px; }
	.modal-md { max-width: 520px; }
	.modal-lg { max-width: 700px; }
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-5) var(--space-6);
		border-bottom: 1px solid var(--color-border-light);
	}
	.modal-header h2 { font-size: var(--font-size-xl); margin: 0; }
	.modal-close {
		width: 36px; height: 36px;
		display: flex; align-items: center; justify-content: center;
		border-radius: var(--radius-full);
		font-size: var(--font-size-lg);
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}
	.modal-close:hover { background: var(--color-bg-alt); color: var(--color-text); }
	.modal-body { padding: var(--space-6); }
	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>
