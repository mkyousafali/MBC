<script lang="ts">
	import { currentEmployee, tasks, stockItems, kitchenOrders, notifications } from '$lib/data/demo';
	import Badge from '$lib/components/common/Badge.svelte';
	import { toasts } from '$lib/stores/toast';

	const quickActions = [
		{ label: 'New Order', icon: '📝', action: () => toasts.add('New order screen (demo)', 'info') },
		{ label: 'Kitchen Queue', icon: '🍳', action: () => window.location.href = '/team/mobile/kitchen' },
		{ label: 'Check Stock', icon: '📦', action: () => toasts.add('Stock check feature (demo)', 'info') },
		{ label: 'Clock In/Out', icon: '⏰', action: () => toasts.add('Clocked in at 9:00 AM (demo)', 'success') },
		{ label: 'Report Issue', icon: '⚠️', action: () => toasts.add('Issue reported (demo)', 'success') },
		{ label: 'View Tasks', icon: '✅', action: () => window.location.href = '/team/mobile/tasks' }
	];

	const lowStock = stockItems.filter(s => s.status !== 'ok');
	const pendingTasks = tasks.filter(t => t.status !== 'completed');
	const unreadNotifs = notifications.filter(n => !n.read);
</script>

<div class="team-dashboard">
	<div class="dashboard-header">
		<div class="header-content">
			<div class="header-left">
				<img src="/App Logo.png" alt="MBC One OS" class="app-logo" />
				<div>
					<h1>{currentEmployee.name}</h1>
					<span class="role">{currentEmployee.role}</span>
				</div>
			</div>
			<div class="header-right">
				<Badge label="On Shift" variant="success" />
				{#if unreadNotifs.length > 0}
					<span class="notif-badge">{unreadNotifs.length}</span>
				{/if}
			</div>
		</div>
		<div class="shift-info">
			<span>🕐 {currentEmployee.shift}</span>
		</div>
	</div>

	<section class="section">
		<h2>Quick Actions</h2>
		<div class="actions-grid">
			{#each quickActions as qa}
				<button class="action-card" onclick={qa.action}>
					<span class="action-icon">{qa.icon}</span>
					<span class="action-label">{qa.label}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="section">
		<div class="section-header">
			<h2>Assigned Tasks</h2>
			<a href="/team/mobile/tasks" class="see-all">See all →</a>
		</div>
		<div class="task-list">
			{#each pendingTasks.slice(0, 3) as task (task.id)}
				<div class="task-card">
					<div class="task-info">
						<span class="task-title">{task.title}</span>
						<span class="task-meta">{task.assignee} • Due: {task.dueTime}</span>
					</div>
					<Badge
						label={task.priority}
						variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'default'}
					/>
				</div>
			{/each}
		</div>
	</section>

	<section class="section">
		<div class="section-header">
			<h2>Kitchen Status</h2>
			<a href="/team/mobile/kitchen" class="see-all">See all →</a>
		</div>
		<div class="kitchen-list">
			{#each kitchenOrders.slice(0, 3) as order}
				<div class="kitchen-card">
					<div class="kitchen-info">
						<span class="kitchen-id">{order.id}</span>
						<span class="kitchen-items">{order.items.join(', ')}</span>
					</div>
					<Badge
						label={order.status}
						variant={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'accent' : 'warning'}
					/>
				</div>
			{/each}
		</div>
	</section>

	{#if lowStock.length > 0}
		<section class="section">
			<h2>⚠️ Stock Alerts</h2>
			<div class="stock-alerts">
				{#each lowStock as item (item.id)}
					<div class="stock-alert">
						<span>{item.name}</span>
						<span class="stock-qty" class:critical={item.status === 'critical'}>
							{item.quantity} {item.unit} (min: {item.minLevel})
						</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="section">
		<h2>Notifications</h2>
		<div class="notif-list">
			{#each notifications.slice(0, 3) as n (n.id)}
				<div class="notif-card" class:unread={!n.read}>
					<span class="notif-title">{n.title}</span>
					<span class="notif-msg">{n.message}</span>
					<span class="notif-time">{n.time}</span>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.team-dashboard { padding: 0; }
	.dashboard-header {
		background: linear-gradient(135deg, var(--color-primary-dark), var(--color-primary));
		padding: var(--space-6) var(--space-5) var(--space-5);
		color: white;
		border-radius: 0 0 var(--radius-xl) var(--radius-xl);
	}
	.header-content { display: flex; justify-content: space-between; align-items: flex-start; }
	.header-left { display: flex; gap: var(--space-3); align-items: center; }
	.app-logo { height: 40px; border-radius: var(--radius-sm); }
	h1 { font-size: var(--font-size-xl); }
	.role { font-size: var(--font-size-sm); opacity: 0.85; }
	.header-right { display: flex; align-items: center; gap: var(--space-2); }
	.notif-badge {
		width: 22px; height: 22px; background: var(--color-danger);
		border-radius: var(--radius-full); font-size: 11px; font-weight: var(--font-weight-bold);
		display: flex; align-items: center; justify-content: center;
	}
	.shift-info {
		margin-top: var(--space-3); font-size: var(--font-size-sm); opacity: 0.85;
		padding: var(--space-2) var(--space-3); background: rgba(255,255,255,0.15);
		border-radius: var(--radius-md); display: inline-block;
	}
	.section { padding: var(--space-5); }
	.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
	h2 { font-size: var(--font-size-lg); margin-bottom: var(--space-3); }
	.see-all { font-size: var(--font-size-sm); color: var(--color-primary); }
	.actions-grid {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3);
	}
	.action-card {
		display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
		padding: var(--space-4); background: var(--color-white);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-xs);
		transition: all var(--transition-fast);
	}
	.action-card:hover { box-shadow: var(--shadow-md); }
	.action-icon { font-size: 1.5rem; }
	.action-label { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); text-align: center; }
	.task-list, .kitchen-list, .notif-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.task-card, .kitchen-card {
		display: flex; justify-content: space-between; align-items: center;
		padding: var(--space-3) var(--space-4); background: var(--color-white);
		border-radius: var(--radius-md); box-shadow: var(--shadow-xs);
	}
	.task-info, .kitchen-info { display: flex; flex-direction: column; gap: 2px; }
	.task-title, .kitchen-id { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
	.task-meta { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.kitchen-items { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.stock-alerts { display: flex; flex-direction: column; gap: var(--space-2); }
	.stock-alert {
		display: flex; justify-content: space-between; padding: var(--space-3);
		background: var(--color-white); border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}
	.stock-qty { color: var(--color-warning); font-weight: var(--font-weight-medium); }
	.stock-qty.critical { color: var(--color-danger); }
	.notif-card {
		display: flex; flex-direction: column; gap: 2px;
		padding: var(--space-3); background: var(--color-white);
		border-radius: var(--radius-md); box-shadow: var(--shadow-xs);
	}
	.notif-card.unread { border-left: 3px solid var(--color-primary); }
	.notif-title { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
	.notif-msg { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.notif-time { font-size: var(--font-size-xs); color: var(--color-text-light); }
</style>
