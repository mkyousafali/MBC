<script lang="ts">
	import {
		dashboardStats, transactions, kitchenOrders,
		stockItems, employees, popularItems, ordersByStatus
	} from '$lib/data/demo';
	import StatCard from '$lib/components/common/StatCard.svelte';
	import Badge from '$lib/components/common/Badge.svelte';
</script>

<div class="dashboard">
	<h1>Dashboard</h1>
	<p class="subtitle">Welcome back — here's what's happening today</p>

	<div class="stats-grid">
		{#each dashboardStats as stat}
			<StatCard
				label={stat.label}
				value={stat.value}
				change={stat.change}
				changeType={stat.changeType}
				icon={stat.icon}
			/>
		{/each}
	</div>

	<div class="dashboard-grid">
		<div class="card">
			<h3>📈 Sales Overview</h3>
			<div class="chart-placeholder">
				<div class="chart-bars">
					{#each [65, 80, 45, 90, 70, 55, 85] as h, i}
						<div class="chart-bar-group">
							<div class="chart-bar" style="height: {h}%"></div>
							<span class="chart-label">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="card">
			<h3>📦 Orders by Status</h3>
			<div class="status-list">
				{#each ordersByStatus as os}
					<div class="status-row">
						<span class="status-dot" style="background: {os.color}"></span>
						<span class="status-name">{os.status}</span>
						<span class="status-count">{os.count}</span>
						<div class="status-bar-bg">
							<div class="status-bar" style="width: {(os.count / 30) * 100}%; background: {os.color}"></div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="card">
			<h3>🔥 Popular Items</h3>
			<div class="popular-list">
				{#each popularItems as item, i}
					<div class="popular-row">
						<span class="popular-rank">#{i + 1}</span>
						<span class="popular-name">{item.name}</span>
						<span class="popular-orders">{item.orders} orders</span>
						<span class="popular-revenue">{item.revenue}</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="card">
			<h3>💰 Recent Transactions</h3>
			<div class="txn-list">
				{#each transactions.slice(0, 5) as txn}
					<div class="txn-row">
						<div class="txn-info">
							<span class="txn-id">{txn.orderId}</span>
							<span class="txn-customer">{txn.customer}</span>
						</div>
						<div class="txn-right">
							<span class="txn-amount">₹{txn.amount}</span>
							<Badge label={txn.method} variant="default" />
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="card">
			<h3>🍳 Kitchen Queue</h3>
			<div class="kitchen-queue">
				{#each kitchenOrders as order}
					<div class="kitchen-row">
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
		</div>

		<div class="card">
			<h3>⚠️ Low Stock Alerts</h3>
			<div class="stock-list">
				{#each stockItems.filter(s => s.status !== 'ok') as item}
					<div class="stock-row">
						<span class="stock-name">{item.name}</span>
						<span class="stock-qty">{item.quantity} {item.unit}</span>
						<Badge
							label={item.status}
							variant={item.status === 'critical' ? 'danger' : 'warning'}
						/>
					</div>
				{/each}
				{#if stockItems.filter(s => s.status !== 'ok').length === 0}
					<p class="all-good">✅ All items in stock</p>
				{/if}
			</div>
		</div>

		<div class="card">
			<h3>👥 Employee Attendance</h3>
			<div class="emp-list">
				{#each employees.slice(0, 5) as emp}
					<div class="emp-row">
						<div class="emp-avatar">{emp.name.charAt(0)}</div>
						<div class="emp-info">
							<span class="emp-name">{emp.name}</span>
							<span class="emp-role">{emp.role}</span>
						</div>
						<Badge
							label={emp.status === 'active' ? 'Present' : 'Absent'}
							variant={emp.status === 'active' ? 'success' : 'danger'}
						/>
					</div>
				{/each}
			</div>
		</div>

		<div class="card">
			<h3>🕐 Recent Activity</h3>
			<div class="activity-list">
				<div class="activity-item"><span class="activity-time">10:15 AM</span><span>New order #1025 received</span></div>
				<div class="activity-item"><span class="activity-time">10:05 AM</span><span>Kitchen marked #1024 as ready</span></div>
				<div class="activity-item"><span class="activity-time">9:50 AM</span><span>Faisal updated menu board prices</span></div>
				<div class="activity-item"><span class="activity-time">9:30 AM</span><span>Low stock alert: Cooking oil</span></div>
				<div class="activity-item"><span class="activity-time">9:00 AM</span><span>Arjun clocked in for morning shift</span></div>
			</div>
		</div>
	</div>
</div>

<style>
	.dashboard h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-1); }
	.subtitle { color: var(--color-text-secondary); margin-bottom: var(--space-6); }
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}
	.dashboard-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-5);
	}
	.card {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5);
	}
	.card h3 { font-size: var(--font-size-base); margin-bottom: var(--space-4); }
	/* Chart placeholder */
	.chart-placeholder { padding: var(--space-4) 0; }
	.chart-bars { display: flex; align-items: flex-end; gap: var(--space-3); height: 160px; }
	.chart-bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
	.chart-bar {
		width: 100%; background: var(--color-primary);
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		min-height: 4px; transition: height var(--transition-normal);
	}
	.chart-label { font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-top: var(--space-2); }
	/* Orders by status */
	.status-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.status-row { display: flex; align-items: center; gap: var(--space-3); }
	.status-dot { width: 10px; height: 10px; border-radius: var(--radius-full); flex-shrink: 0; }
	.status-name { font-size: var(--font-size-sm); min-width: 80px; }
	.status-count { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); min-width: 24px; }
	.status-bar-bg { flex: 1; height: 8px; background: var(--color-bg-alt); border-radius: var(--radius-full); overflow: hidden; }
	.status-bar { height: 100%; border-radius: var(--radius-full); transition: width var(--transition-normal); }
	/* Popular items */
	.popular-list { display: flex; flex-direction: column; gap: var(--space-2); }
	.popular-row {
		display: flex; align-items: center; gap: var(--space-3);
		padding: var(--space-2) 0; font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-border-light);
	}
	.popular-row:last-child { border-bottom: none; }
	.popular-rank { font-weight: var(--font-weight-bold); color: var(--color-accent); min-width: 24px; }
	.popular-name { flex: 1; }
	.popular-orders { color: var(--color-text-secondary); min-width: 70px; }
	.popular-revenue { font-weight: var(--font-weight-semibold); color: var(--color-primary); }
	/* Transactions */
	.txn-list { display: flex; flex-direction: column; gap: var(--space-2); }
	.txn-row {
		display: flex; justify-content: space-between; align-items: center;
		padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border-light);
	}
	.txn-row:last-child { border-bottom: none; }
	.txn-info { display: flex; flex-direction: column; }
	.txn-id { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
	.txn-customer { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.txn-right { display: flex; align-items: center; gap: var(--space-2); }
	.txn-amount { font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm); }
	/* Kitchen */
	.kitchen-queue { display: flex; flex-direction: column; gap: var(--space-2); }
	.kitchen-row {
		display: flex; justify-content: space-between; align-items: center;
		padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border-light);
	}
	.kitchen-row:last-child { border-bottom: none; }
	.kitchen-info { display: flex; flex-direction: column; }
	.kitchen-id { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
	.kitchen-items { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	/* Stock */
	.stock-list { display: flex; flex-direction: column; gap: var(--space-2); }
	.stock-row {
		display: flex; align-items: center; gap: var(--space-3);
		padding: var(--space-2) 0; font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-border-light);
	}
	.stock-row:last-child { border-bottom: none; }
	.stock-name { flex: 1; }
	.stock-qty { color: var(--color-text-secondary); }
	.all-good { text-align: center; color: var(--color-success); padding: var(--space-4); }
	/* Employees */
	.emp-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.emp-row { display: flex; align-items: center; gap: var(--space-3); }
	.emp-avatar {
		width: 32px; height: 32px; border-radius: var(--radius-full);
		background: var(--color-primary-50); color: var(--color-primary);
		display: flex; align-items: center; justify-content: center;
		font-weight: var(--font-weight-bold); font-size: var(--font-size-sm);
	}
	.emp-info { flex: 1; display: flex; flex-direction: column; }
	.emp-name { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
	.emp-role { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	/* Activity */
	.activity-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.activity-item {
		display: flex; gap: var(--space-3); font-size: var(--font-size-sm);
		padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border-light);
	}
	.activity-item:last-child { border-bottom: none; }
	.activity-time { color: var(--color-text-light); min-width: 70px; font-size: var(--font-size-xs); }

	@media (max-width: 1200px) {
		.dashboard-grid { grid-template-columns: 1fr; }
		.stats-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
	}
</style>
