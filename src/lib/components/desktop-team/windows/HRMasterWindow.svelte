<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';

	const RESOURCE_KEY = 'hr.management.master';
	let isSA = $state(false);
	let permEdit = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	type Employee = {
		user_id: string;
		employee_id: string;
		employee_code: string;
		full_name: string;
		username: string;
		whatsapp_number: string;
		email: string | null;
		job_title_name: string;
		salary_amount: number;
		salary_type: string;
		joining_date: string;
		employment_status: string;
		branch_name: string | null;
		is_active: boolean;
		created_at: string;
	};

	type EmployeeDetail = {
		user_id: string;
		full_name: string;
		username: string;
		is_active: boolean;
		employee_id: string;
		employee_code: string;
		job_title_id: string;
		job_title_name: string;
		salary_amount: number;
		salary_type: string;
		salary_day: string | null;
		whatsapp_number: string;
		email: string | null;
		joining_date: string;
		id_type: string;
		id_number: string;
		state: string;
		district: string;
		known_languages: string[];
		employment_status: string;
		branch_id: string | null;
		branch_name: string | null;
		ledger_id: string | null;
		ledger_code: string | null;
		ledger_balance: number;
		created_at: string;
	};

	let loading = $state(false);
	let employees = $state<Employee[]>([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	const pageSize = 20;
	let searchQuery = $state('');
	let statusFilter = $state<string | null>(null);

	// Detail panel
	let selectedEmployee = $state<EmployeeDetail | null>(null);
	let detailLoading = $state(false);

	async function loadEmployees() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_list_employee_users', {
			p_search: searchQuery,
			p_status_filter: statusFilter,
			p_job_title_filter: null,
			p_branch_filter: null,
			p_sort_by: 'full_name',
			p_sort_dir: 'asc',
			p_limit: pageSize,
			p_offset: (currentPage - 1) * pageSize
		});
		loading = false;
		if (error) { toasts.add('Failed to load employees: ' + error.message, 'error'); return; }
		employees = data?.data || [];
		totalCount = data?.total || 0;
	}

	async function viewDetail(emp: Employee) {
		detailLoading = true;
		selectedEmployee = null;
		const { data, error } = await supabase.rpc('rpc_get_employee_detail', { p_user_id: emp.user_id });
		detailLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load details', 'error'); return; }
		selectedEmployee = data.data;
	}

	function closeDetail() {
		selectedEmployee = null;
	}

	function doSearch() { currentPage = 1; loadEmployees(); }

	function formatDate(d: string): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function formatCurrency(n: number): string {
		return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
	}

	function statusColor(s: string): string {
		if (s === 'active') return 'st-active';
		if (s === 'inactive' || s === 'terminated' || s === 'resigned') return 'st-inactive';
		return 'st-other';
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize));

	$effect(() => { loadEmployees(); });
</script>

<div class="hr-master">
	{#if selectedEmployee}
		<!-- Detail View -->
		<div class="detail-panel">
			<div class="detail-header">
				<button class="btn-back" onclick={closeDetail}>← Back to List</button>
				<h2 class="detail-title">{selectedEmployee.full_name}</h2>
				<span class="emp-code">{selectedEmployee.employee_code}</span>
			</div>

			<div class="detail-grid">
				<!-- Personal Info -->
				<div class="detail-section">
					<h3 class="section-title">👤 Personal Information</h3>
					<div class="detail-rows">
						<div class="detail-row"><span class="label">Full Name</span><span class="value">{selectedEmployee.full_name}</span></div>
						<div class="detail-row"><span class="label">Username</span><span class="value">{selectedEmployee.username}</span></div>
						<div class="detail-row"><span class="label">WhatsApp</span><span class="value">{selectedEmployee.whatsapp_number}</span></div>
						<div class="detail-row"><span class="label">Email</span><span class="value">{selectedEmployee.email || '—'}</span></div>
						<div class="detail-row"><span class="label">State</span><span class="value">{selectedEmployee.state}</span></div>
						<div class="detail-row"><span class="label">District</span><span class="value">{selectedEmployee.district}</span></div>
						<div class="detail-row"><span class="label">ID Type</span><span class="value">{selectedEmployee.id_type}</span></div>
						<div class="detail-row"><span class="label">ID Number</span><span class="value">{selectedEmployee.id_number || '—'}</span></div>
						<div class="detail-row"><span class="label">Languages</span><span class="value">{selectedEmployee.known_languages?.join(', ') || '—'}</span></div>
					</div>
				</div>

				<!-- Employment Info -->
				<div class="detail-section">
					<h3 class="section-title">💼 Employment Details</h3>
					<div class="detail-rows">
						<div class="detail-row"><span class="label">Employee Code</span><span class="value">{selectedEmployee.employee_code}</span></div>
						<div class="detail-row"><span class="label">Job Title</span><span class="value">{selectedEmployee.job_title_name}</span></div>
						<div class="detail-row"><span class="label">Branch</span><span class="value">{selectedEmployee.branch_name || '—'}</span></div>
						<div class="detail-row"><span class="label">Status</span><span class="value"><span class="status-badge {statusColor(selectedEmployee.employment_status)}">{selectedEmployee.employment_status}</span></span></div>
						<div class="detail-row"><span class="label">Joining Date</span><span class="value">{formatDate(selectedEmployee.joining_date)}</span></div>
						<div class="detail-row"><span class="label">Account Active</span><span class="value">{selectedEmployee.is_active ? '✅ Yes' : '❌ No'}</span></div>
						<div class="detail-row"><span class="label">Created</span><span class="value">{formatDate(selectedEmployee.created_at)}</span></div>
					</div>
				</div>

				<!-- Salary & Finance -->
				<div class="detail-section">
					<h3 class="section-title">💰 Salary & Finance</h3>
					<div class="detail-rows">
						<div class="detail-row"><span class="label">Salary Amount</span><span class="value font-bold">{formatCurrency(selectedEmployee.salary_amount)}</span></div>
						<div class="detail-row"><span class="label">Salary Type</span><span class="value capitalize">{selectedEmployee.salary_type}</span></div>
						{#if selectedEmployee.salary_day}
							<div class="detail-row"><span class="label">Salary Day</span><span class="value capitalize">{selectedEmployee.salary_day}</span></div>
						{/if}
						<div class="detail-row"><span class="label">Ledger Code</span><span class="value">{selectedEmployee.ledger_code || '—'}</span></div>
						<div class="detail-row">
							<span class="label">Ledger Balance</span>
							<span class="value font-bold" class:balance-positive={selectedEmployee.ledger_balance >= 0} class:balance-negative={selectedEmployee.ledger_balance < 0}>
								{formatCurrency(Math.abs(selectedEmployee.ledger_balance))}
								{selectedEmployee.ledger_balance >= 0 ? ' (Payable)' : ' (Receivable)'}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Table View -->
		<div class="toolbar">
			<div class="search-box">
				<input type="text" placeholder="Search name, code, phone..." bind:value={searchQuery} onkeydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
				<button class="btn-sm" onclick={doSearch}>Search</button>
			</div>
			<select class="filter-select" bind:value={statusFilter} onchange={doSearch}>
				<option value={null}>All Status</option>
				<option value="active">Active</option>
				<option value="inactive">Inactive</option>
				<option value="on_leave">On Leave</option>
				<option value="suspended">Suspended</option>
				<option value="terminated">Terminated</option>
				<option value="resigned">Resigned</option>
			</select>
		</div>

		{#if loading}
			<div class="center-state">Loading...</div>
		{:else if employees.length === 0}
			<div class="center-state">No employees found.</div>
		{:else}
			<div class="table-wrap">
				<table class="data-table">
					<thead><tr>
						<th>Code</th>
						<th>Name</th>
						<th>Job Title</th>
						<th>Branch</th>
						<th>Phone</th>
						<th>Status</th>
					</tr></thead>
					<tbody>
						{#each employees as emp}
							<tr class="emp-row" onclick={() => viewDetail(emp)}>
								<td class="col-code">{emp.employee_code}</td>
								<td class="col-name">{emp.full_name}</td>
								<td>{emp.job_title_name}</td>
								<td>{emp.branch_name || '—'}</td>
								<td>{emp.whatsapp_number}</td>
								<td><span class="status-badge {statusColor(emp.employment_status)}">{emp.employment_status}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="pagination">
				<span class="pg-info">Showing {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize, totalCount)} of {totalCount}</span>
				<div class="pg-btns">
					<button class="pg-btn" disabled={currentPage <= 1} onclick={() => { currentPage--; loadEmployees(); }}>‹</button>
					<span class="pg-num">{currentPage} / {totalPages}</span>
					<button class="pg-btn" disabled={currentPage >= totalPages} onclick={() => { currentPage++; loadEmployees(); }}>›</button>
				</div>
			</div>
		{/if}
	{/if}

	{#if detailLoading}
		<div class="detail-loading-overlay">Loading employee details...</div>
	{/if}
</div>

<style>
	.hr-master { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 12px; position: relative; }

	/* Toolbar */
	.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
	.search-box { display: flex; gap: 6px; flex: 1; min-width: 200px; }
	.search-box input { flex: 1; padding: 7px 12px; border: 1.5px solid var(--color-border); border-radius: 6px; font-size: 13px; }
	.search-box input:focus { outline: none; border-color: var(--color-primary); }
	.filter-select { padding: 7px 10px; border: 1.5px solid var(--color-border); border-radius: 6px; font-size: 13px; background: white; }
	.btn-sm { padding: 7px 14px; border: 1px solid var(--color-border); border-radius: 5px; background: white; font-size: 12px; cursor: pointer; }
	.btn-sm:hover { background: var(--color-bg); }

	.center-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); font-size: 14px; }

	/* Table */
	.table-wrap { flex: 1; overflow: auto; border: 1px solid var(--color-border-light); border-radius: 8px; }
	.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.data-table thead { background: var(--color-bg-alt); position: sticky; top: 0; z-index: 2; }
	.data-table th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border); }
	.data-table td { padding: 9px 12px; border-bottom: 1px solid var(--color-border-light); }
	.emp-row { cursor: pointer; transition: background 0.1s; }
	.emp-row:hover td { background: var(--color-surface-hover); }
	.col-code { font-family: monospace; font-size: 12px; color: var(--color-primary); font-weight: 600; }
	.col-name { font-weight: 500; }
	.col-salary { white-space: nowrap; }
	.salary-type { font-size: 10px; color: var(--color-text-secondary); }
	.col-date { font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; }

	.status-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
	.st-active { background: #dcfce7; color: #166534; }
	.st-inactive { background: #fde8e8; color: #991b1b; }
	.st-other { background: #fef3c7; color: #92400e; }

	/* Pagination */
	.pagination { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; }
	.pg-info { font-size: 12px; color: var(--color-text-secondary); }
	.pg-btns { display: flex; align-items: center; gap: 8px; }
	.pg-btn { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--color-border); background: white; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
	.pg-btn:disabled { opacity: 0.4; cursor: default; }
	.pg-num { font-size: 12px; color: var(--color-text-secondary); }

	/* Detail Panel */
	.detail-panel { display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto; }
	.detail-header { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border-light); }
	.btn-back { padding: 6px 12px; border: 1px solid var(--color-border); border-radius: 6px; background: white; cursor: pointer; font-size: 13px; }
	.btn-back:hover { background: var(--color-bg); }
	.detail-title { font-size: 18px; font-weight: 600; color: var(--color-text); margin: 0; }
	.emp-code { font-family: monospace; font-size: 12px; color: var(--color-primary); background: var(--color-bg-alt); padding: 3px 8px; border-radius: 4px; }

	.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
	.detail-section { background: white; border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px; }
	.section-title { font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: var(--color-text); }
	.detail-rows { display: flex; flex-direction: column; gap: 8px; }
	.detail-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
	.detail-row .label { font-size: 12px; color: var(--color-text-secondary); }
	.detail-row .value { font-size: 13px; font-weight: 500; text-align: right; }
	.font-bold { font-weight: 700 !important; }
	.capitalize { text-transform: capitalize; }
	.balance-positive { color: #166534; }
	.balance-negative { color: #991b1b; }

	.detail-loading-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--color-text-secondary); z-index: 10; border-radius: 8px; }
</style>
