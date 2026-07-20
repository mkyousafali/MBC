<script lang="ts">
	let {
		label = '', type = 'text', placeholder = '', value = $bindable(''),
		required = false, disabled = false, error = '', id = ''
	}: {
		label?: string; type?: string; placeholder?: string; value?: string;
		required?: boolean; disabled?: boolean; error?: string; id?: string;
	} = $props();
</script>

<div class="input-group">
	{#if label}
		<label for={id}>{label}{#if required}<span class="required">*</span>{/if}</label>
	{/if}
	<input
		{id}
		{type}
		{placeholder}
		{required}
		{disabled}
		bind:value
		class:has-error={!!error}
	/>
	{#if error}
		<span class="error-text">{error}</span>
	{/if}
</div>

<style>
	.input-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		width: 100%;
	}
	label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}
	.required { color: var(--color-danger); margin-left: 2px; }
	input {
		padding: var(--space-3) var(--space-4);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-base);
		background: var(--color-white);
		color: var(--color-text);
		transition: border-color var(--transition-fast);
		width: 100%;
	}
	input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px var(--color-primary-50);
	}
	input.has-error { border-color: var(--color-danger); }
	input:disabled { background: var(--color-bg-alt); opacity: 0.7; }
	.error-text { font-size: var(--font-size-xs); color: var(--color-danger); }
</style>
