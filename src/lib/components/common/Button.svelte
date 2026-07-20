<script lang="ts">
	let { variant = 'primary', size = 'md', disabled = false, fullWidth = false, onclick, children, type = 'button' }: {
		variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		fullWidth?: boolean;
		onclick?: (e: MouseEvent) => void;
		children: any;
		type?: 'button' | 'submit' | 'reset';
	} = $props();
</script>

<button
	{type}
	class="btn btn-{variant} btn-{size}"
	class:full-width={fullWidth}
	{disabled}
	onclick={onclick}
>
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		font-weight: var(--font-weight-semibold);
		border-radius: var(--radius-md);
		transition: all var(--transition-fast);
		white-space: nowrap;
		cursor: pointer;
		border: 2px solid transparent;
		line-height: 1;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-sm { padding: var(--space-2) var(--space-3); font-size: var(--font-size-sm); }
	.btn-md { padding: var(--space-3) var(--space-5); font-size: var(--font-size-base); }
	.btn-lg { padding: var(--space-4) var(--space-8); font-size: var(--font-size-lg); }

	.btn-primary {
		background: var(--color-primary);
		color: var(--color-text-on-primary);
	}
	.btn-primary:hover:not(:disabled) { background: var(--color-primary-light); }

	.btn-secondary {
		background: var(--color-bg-alt);
		color: var(--color-text);
	}
	.btn-secondary:hover:not(:disabled) { background: var(--color-border-light); }

	.btn-accent {
		background: var(--color-accent);
		color: var(--color-text-on-accent);
	}
	.btn-accent:hover:not(:disabled) { background: var(--color-accent-light); }

	.btn-outline {
		background: transparent;
		color: var(--color-primary);
		border-color: var(--color-primary);
	}
	.btn-outline:hover:not(:disabled) { background: var(--color-primary-50); }

	.btn-ghost {
		background: transparent;
		color: var(--color-text);
	}
	.btn-ghost:hover:not(:disabled) { background: var(--color-bg-alt); }

	.btn-danger {
		background: var(--color-danger);
		color: white;
	}
	.btn-danger:hover:not(:disabled) { opacity: 0.9; }

	.full-width { width: 100%; }
</style>
