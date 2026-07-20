<script lang="ts">
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
</script>

<PageHeader
	title="Reports"
	description="View sales, inventory and performance reports"
	breadcrumbs={[{ label: 'Dashboard', href: '/team/desktop' }, { label: 'Reports' }]}
/>
<div class="page-card">
	<div class="report-grid">
		{#each [
			{ icon: '📊', title: 'Sales Report', desc: 'Daily, weekly and monthly sales analysis' },
			{ icon: '📦', title: 'Order Report', desc: 'Order volume and status breakdown' },
			{ icon: '🍛', title: 'Menu Performance', desc: 'Best-selling items and revenue per item' },
			{ icon: '📦', title: 'Inventory Report', desc: 'Stock levels, consumption and wastage' },
			{ icon: '👥', title: 'Staff Report', desc: 'Attendance, performance and shifts' },
			{ icon: '💰', title: 'Expense Report', desc: 'Category-wise expense breakdown' }
		] as report}
			<div class="report-card">
				<span class="report-icon">{report.icon}</span>
				<h3>{report.title}</h3>
				<p>{report.desc}</p>
			</div>
		{/each}
	</div>
</div>

<style>
	.page-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: var(--space-6); }
	.report-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-4);
	}
	.report-card {
		padding: var(--space-5);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: all var(--transition-fast);
		cursor: pointer;
	}
	.report-card:hover { border-color: var(--color-primary); background: var(--color-primary-50); }
	.report-icon { font-size: 1.5rem; display: block; margin-bottom: var(--space-3); }
	.report-card h3 { font-size: var(--font-size-base); margin-bottom: var(--space-1); }
	.report-card p { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
</style>
