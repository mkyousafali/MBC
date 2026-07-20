<script lang="ts">
	let { title = 'Are you sure?', message = '', open = $bindable(false), onconfirm, oncancel }: {
		title?: string; message?: string; open: boolean;
		onconfirm?: () => void; oncancel?: () => void;
	} = $props();

	import Button from './Button.svelte';
	import Modal from './Modal.svelte';
</script>

<Modal bind:open title={title}>
	{#if message}
		<p class="confirm-message">{message}</p>
	{/if}
	<div class="confirm-actions">
		<Button variant="secondary" onclick={() => { open = false; oncancel?.(); }}>Cancel</Button>
		<Button variant="danger" onclick={() => { open = false; onconfirm?.(); }}>Confirm</Button>
	</div>
</Modal>

<style>
	.confirm-message {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-6);
		line-height: var(--line-height-relaxed);
	}
	.confirm-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
	}
</style>
