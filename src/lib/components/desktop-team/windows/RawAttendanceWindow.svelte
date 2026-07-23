<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog } from '$lib/utils/audit';

	const RESOURCE_KEY = 'hr.reports.raw_attendance';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	let permDelete = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
		permDelete = isSA || (r?.can_delete ?? false);
	});

	// Data
	let records: any[] = $state([]);
	let totalCount = $state(0);
	let loading = $state(false);
	let loadingMore = $state(false);
	let offset = $state(0);
	const PAGE_SIZE = 100;

	// Filters
	let searchQuery = $state('');
	let filterBranch = $state('');
	let filterAction = $state('');
	let filterDate = $state('');
	let filterDateFrom = $state('');
	let filterDateTo = $state('');

	// Branches for dropdown
	let branches: { id: string; branch_name: string }[] = $state([]);

	// Debounce search
	let searchTimeout: any = null;

	onMount(async () => {
		await loadBranches();
		await loadData();
	});

	async function loadBranches() {
		const { data } = await supabase.rpc('rpc_get_branches_list');
		if (data) branches = data;
	}

	async function loadData(append = false) {
		if (!append) {
			loading = true;
			offset = 0;
			records = [];
		} else {
			loadingMore = true;
		}

		const params: any = {
			p_limit: PAGE_SIZE,
			p_offset: append ? offset : 0
		};
		if (filterBranch) params.p_branch_id = filterBranch;
		if (filterAction) params.p_action_type = filterAction;
		if (filterDate) params.p_date = filterDate;
		if (filterDateFrom) params.p_date_from = filterDateFrom;
		if (filterDateTo) params.p_date_to = filterDateTo;
		if (searchQuery.trim()) params.p_search = searchQuery.trim();

		const { data, error } = await supabase.rpc('rpc_get_attendance_logs', params);

		if (!error && data?.success) {
			if (append) {
				records = [...records, ...data.data];
			} else {
				records = data.data || [];
			}
			totalCount = data.total;
		}

		loading = false;
		loadingMore = false;
	}

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => loadData(), 400);
	}

	function applyFilters() {
		loadData();
	}

	function clearFilters() {
		searchQuery = '';
		filterBranch = '';
		filterAction = '';
		filterDate = '';
		filterDateFrom = '';
		filterDateTo = '';
		loadData();
	}

	function loadMore() {
		offset += PAGE_SIZE;
		loadData(true);
	}

	function formatDateTime(iso: string) {
		const d = new Date(iso);
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
			' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function formatAction(action: string) {
		return action === 'clock_in' ? 'Clock In' : 'Clock Out';
	}
</script>

<div class="raw-attendance-window">
	<!-- Header -->
	<div class="window-header">
		<h2>📋 Raw Attendance</h2>
		<span class="record-count">{totalCount} total records</span>
	</div>

	<!-- Filters -->
	<div class="filters-bar">
		<div class="search-box">
			<input
				type="text"
				placeholder="Search by name or code..."
				bind:value={searchQuery}
				oninput={handleSearch}
			/>
		</div>

		<div class="filter-group">
			<select bind:value={filterBranch} onchange={applyFilters}>
				<option value="">All Branches</option>
				{#each branches as b}
					<option value={b.id}>{b.branch_name}</option>
				{/each}
			</select>

			<select bind:value={filterAction} onchange={applyFilters}>
				<option value="">All Actions</option>
				<option value="clock_in">Clock In</option>
				<option value="clock_out">Clock Out</option>
			</select>

			<input type="date" bind:value={filterDate} onchange={applyFilters} title="Specific Date" />

			<span class="filter-separator">or range:</span>

			<input type="date" bind:value={filterDateFrom} onchange={applyFilters} title="From Date" />
			<span class="filter-dash">–</span>
			<input type="date" bind:value={filterDateTo} onchange={applyFilters} title="To Date" />

			<button class="clear-btn" onclick={clearFilters}>Clear</button>
		</div>
	</div>

	<!-- Table -->
	<div class="table-container">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading attendance records...</p>
			</div>
		{:else if records.length === 0}
			<div class="empty-state">
				<p>No attendance records found.</p>
			</div>
		{:else}
			<table class="attendance-table">
				<thead>
					<tr>
						<th>#</th>
						<th>Employee</th>
						<th>Code</th>
						<th>Branch</th>
						<th>Action</th>
						<th>Date & Time</th>
					</tr>
				</thead>
				<tbody>
					{#each records as record, i}
						<tr>
							<td class="row-num">{i + 1}</td>
							<td class="emp-name">{record.employee_name}</td>
							<td class="emp-code">{record.employee_code}</td>
							<td>{record.branch_name}</td>
							<td>
								<span class="action-badge {record.action_type}">
									{formatAction(record.action_type)}
								</span>
							</td>
							<td class="datetime">{formatDateTime(record.recorded_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Load More -->
			{#if records.length < totalCount}
				<div class="load-more">
					<button class="load-more-btn" onclick={loadMore} disabled={loadingMore}>
						{#if loadingMore}
							Loading...
						{:else}
							Load More ({records.length} of {totalCount})
						{/if}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.raw-attendance-window {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 20px;
		gap: 16px;
		overflow: hidden;
	}

	.window-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.window-header h2 {
		font-size: 18px;
		font-weight: 700;
		color: #2B2B2B;
		margin: 0;
	}

	.record-count {
		font-size: 13px;
		color: #888;
		background: #f0f0f0;
		padding: 4px 10px;
		border-radius: 12px;
	}

	/* Filters */
	.filters-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}

	.search-box input {
		padding: 8px 12px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 13px;
		width: 220px;
		outline: none;
		transition: border-color 0.2s;
	}

	.search-box input:focus {
		border-color: #0E5A3C;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.filter-group select,
	.filter-group input[type="date"] {
		padding: 7px 10px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 12px;
		outline: none;
		background: white;
	}

	.filter-group select:focus,
	.filter-group input[type="date"]:focus {
		border-color: #0E5A3C;
	}

	.filter-separator {
		font-size: 12px;
		color: #999;
	}

	.filter-dash {
		color: #999;
	}

	.clear-btn {
		padding: 7px 14px;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: white;
		font-size: 12px;
		cursor: pointer;
		color: #666;
		transition: all 0.2s;
	}

	.clear-btn:hover {
		background: #f5f5f5;
		border-color: #bbb;
	}

	/* Table */
	.table-container {
		flex: 1;
		overflow-y: auto;
		border: 1px solid #e8e8e8;
		border-radius: 8px;
		background: white;
	}

	.attendance-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	.attendance-table thead {
		position: sticky;
		top: 0;
		background: #f8f9fa;
		z-index: 1;
	}

	.attendance-table th {
		padding: 10px 12px;
		text-align: left;
		font-weight: 600;
		color: #555;
		border-bottom: 2px solid #e0e0e0;
		border-right: 1px solid #e8e8e8;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.attendance-table th:last-child {
		border-right: none;
	}

	.attendance-table td {
		padding: 10px 12px;
		border-bottom: 1px solid #e8e8e8;
		border-right: 1px solid #f0f0f0;
		color: #333;
	}

	.attendance-table td:last-child {
		border-right: none;
	}

	.attendance-table tbody tr:hover {
		background: #f8fdf9;
	}

	.row-num {
		color: #aaa;
		font-size: 12px;
		width: 40px;
	}

	.emp-name {
		font-weight: 500;
	}

	.emp-code {
		font-family: monospace;
		font-size: 12px;
		color: #666;
	}

	.datetime {
		font-size: 12px;
		color: #555;
		white-space: nowrap;
	}

	/* Action badges */
	.action-badge {
		display: inline-block;
		padding: 3px 10px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
	}

	.action-badge.clock_in {
		background: #e6f7ee;
		color: #0E5A3C;
	}

	.action-badge.clock_out {
		background: #fff3e6;
		color: #b36b00;
	}

	/* States */
	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		gap: 12px;
		color: #888;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e0e0e0;
		border-top-color: #0E5A3C;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Load More */
	.load-more {
		padding: 12px;
		text-align: center;
		border-top: 1px solid #f0f0f0;
	}

	.load-more-btn {
		padding: 8px 24px;
		border: 1px solid #0E5A3C;
		border-radius: 6px;
		background: white;
		color: #0E5A3C;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.load-more-btn:hover:not(:disabled) {
		background: #0E5A3C;
		color: white;
	}

	.load-more-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
