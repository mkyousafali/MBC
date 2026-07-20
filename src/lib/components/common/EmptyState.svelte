<script lang="ts">
	let { title = 'Nothing here yet', message = 'Data will appear here once available.', icon = '📋' }: {
		title?: string; message?: string; icon?: string;
	} = $props();
</script>

<div class="empty-state">
	<span class="empty-icon">{icon}</span>
	<h3>{title}</h3>
	<p>{message}</p>
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-12) var(--space-6);
		text-align: center;
	}
	.empty-icon { font-size: 3rem; margin-bottom: var(--space-4); opacity: 0.6; }
	h3 { font-size: var(--font-size-lg); color: var(--color-text); margin-bottom: var(--space-2); }
	p { font-size: var(--font-size-sm); color: var(--color-text-secondary); max-width: 400px; }
</style>
