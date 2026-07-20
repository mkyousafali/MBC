<script lang="ts">
	import { tasks } from '$lib/data/demo';
	import Badge from '$lib/components/common/Badge.svelte';
	import { toasts } from '$lib/stores/toast';

	let filter = $state('all');
	const filtered = $derived(filter === 'all' ? tasks : tasks.filter(t => t.status === filter));
</script>

<div class="tasks-page">
	<h1>Tasks</h1>
	<div class="filters">
		{#each ['all', 'pending', 'in-progress', 'completed'] as f}
			<button class="filter-btn" class:active={filter === f} onclick={() => filter = f}>{f}</button>
		{/each}
	</div>
	<div class="task-list">
		{#each filtered as task (task.id)}
			<div class="task-card">
				<div class="task-top">
					<span class="task-title">{task.title}</span>
					<Badge label={task.priority} variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'default'} />
				</div>
				<div class="task-meta">
					<span>👤 {task.assignee}</span>
					<span>⏰ Due: {task.dueTime}</span>
				</div>
				<div class="task-bottom">
					<Badge label={task.status} variant={task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'info' : 'warning'} />
					{#if task.status !== 'completed'}
						<button class="complete-btn" onclick={() => toasts.add(`Task "${task.title}" completed (demo)`, 'success')}>Complete</button>
					{/if}
				</div>
			</div>
		{:else}
			<p class="empty">No tasks in this category</p>
		{/each}
	</div>
</div>

<style>
	.tasks-page { padding: var(--space-5); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-4); }
	.filters { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); overflow-x: auto; }
	.filters::-webkit-scrollbar { display: none; }
	.filter-btn {
		padding: var(--space-2) var(--space-4); border-radius: var(--radius-full);
		font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
		background: var(--color-white); color: var(--color-text-secondary);
		border: 1.5px solid var(--color-border); text-transform: capitalize; white-space: nowrap;
	}
	.filter-btn.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
	.task-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.task-card { background: var(--color-white); border-radius: var(--radius-lg); padding: var(--space-4); box-shadow: var(--shadow-xs); }
	.task-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2); }
	.task-title { font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm); }
	.task-meta { display: flex; gap: var(--space-4); font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-bottom: var(--space-3); }
	.task-bottom { display: flex; justify-content: space-between; align-items: center; }
	.complete-btn {
		padding: var(--space-1) var(--space-3); background: var(--color-success);
		color: white; border-radius: var(--radius-md); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold);
	}
	.empty { text-align: center; color: var(--color-text-light); padding: var(--space-8); }
</style>
