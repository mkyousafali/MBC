<script lang="ts">
	let { label = '', variant = 'default' }: {
		label: string;
		variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
	} = $props();
</script>

<span class="badge badge-{variant}">{label}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		line-height: 1.5;
		white-space: nowrap;
	}
	.badge-default { background: var(--color-bg-alt); color: var(--color-text-secondary); }
	.badge-success { background: #d4edda; color: #155724; }
	.badge-warning { background: #fff3cd; color: #856404; }
	.badge-danger { background: #f8d7da; color: #721c24; }
	.badge-info { background: #d1ecf1; color: #0c5460; }
	.badge-accent { background: #fef3cd; color: var(--color-accent-dark); }
</style>
