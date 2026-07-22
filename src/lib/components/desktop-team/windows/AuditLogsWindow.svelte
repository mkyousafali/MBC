<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';

	type AuditEntry = {
		id: string; user_id: string; user_name: string;
		action: string; resource_type: string; resource_id: string | null;
		resource_label: string | null; details: any; created_at: string;
	};

	let loading = $state(false);
	let logs = $state<AuditEntry[]>([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	const pageSize = 30;

	// Filters
	let searchQuery = $state('');
	let actionFilter = $state('');
	let resourceFilter = $state('');
	let expandedRow = $state<string | null>(null);

	async function loadLogs() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_list_audit_logs', {
			p_search: searchQuery,
			p_action_filter: actionFilter,
			p_resource_filter: resourceFilter,
			p_user_filter: '',
			p_date_from: null,
			p_date_to: null,
			p_limit: pageSize,
			p_offset: (currentPage - 1) * pageSize
		});
		loading = false;
		if (error) { toasts.add('Failed to load audit logs: ' + error.message, 'error'); return; }
		logs = data?.data || [];
		totalCount = data?.total || 0;
	}

	function doSearch() { currentPage = 1; loadLogs(); }

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
			' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function actionLabel(action: string): string {
		const labels: Record<string, string> = {
			view: '👁️ View', login: '🔑 Login', logout: '🚪 Logout', create: '➕ Create',
			update: '✏️ Update', delete: '🗑️ Delete',
			status_change: '🔄 Status Change', permission_change: '🔐 Permission Change'
		};
		return labels[action] || action;
	}

	function actionClass(action: string): string {
		if (action === 'view') return 'act-blue';
		if (action === 'create' || action === 'login') return 'act-green';
		if (action === 'delete' || action === 'logout') return 'act-red';
		if (action === 'update' || action === 'status_change' || action === 'permission_change') return 'act-orange';
		return '';
	}

	function formatChanges(details: any): string {
		if (!details?.changes) return '';
		return details.changes.map((c: any) => {
			if (c.from !== undefined && c.to !== undefined) {
				return `${c.field}: "${c.from}" → "${c.to}"`;
			} else if (c.to !== undefined) {
				return `${c.field}: set to "${c.to}"`;
			} else if (c.from !== undefined) {
				return `${c.field}: removed "${c.from}"`;
			}
			return c.field;
		}).join('\n');
	}

	function toggleExpand(id: string) {
		expandedRow = expandedRow === id ? null : id;
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize));

	$effect(() => { loadLogs(); });
</script>

<div class="audit-window">
	<div class="toolbar">
		<div class="search-box">
			<input type="text" placeholder="Search user, resource, action..." bind:value={searchQuery} onkeydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
			<button class="btn-sm" onclick={doSearch}>Search</button>
		</div>
		<select class="filter-select" bind:value={actionFilter} onchange={doSearch}>
			<option value="">All Actions</option>
			<option value="view">View</option>
			<option value="login">Login</option>
			<option value="logout">Logout</option>
			<option value="create">Create</option>
			<option value="update">Update</option>
			<option value="delete">Delete</option>
			<option value="status_change">Status Change</option>
			<option value="permission_change">Permission Change</option>
		</select>
		<select class="filter-select" bind:value={resourceFilter} onchange={doSearch}>
			<option value="">All Resources</option>
			<option value="window">Windows</option>
			<option value="user">Users</option>
			<option value="branch">Branches</option>
			<option value="permission">Permissions</option>
			<option value="session">Session</option>
		</select>
	</div>

	{#if loading}
		<div class="center-state">Loading...</div>
	{:else if logs.length === 0}
		<div class="center-state">No audit logs found.</div>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead><tr>
					<th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Target</th><th>Details</th>
				</tr></thead>
				<tbody>
					{#each logs as log}
						<tr class="log-row" onclick={() => toggleExpand(log.id)}>
							<td class="col-time">{formatDate(log.created_at)}</td>
							<td class="col-user">{log.user_name}</td>
							<td class="col-action"><span class="action-badge {actionClass(log.action)}">{actionLabel(log.action)}</span></td>
							<td class="col-resource">{log.resource_type}</td>
							<td class="col-target">{log.resource_label || log.resource_id || '—'}</td>
							<td class="col-details">
								{#if log.details?.changes}
									<span class="change-count">{log.details.changes.length} change{log.details.changes.length > 1 ? 's' : ''}</span>
								{:else if log.details}
									<span class="has-details">📋</span>
								{:else}
									—
								{/if}
							</td>
						</tr>
						{#if expandedRow === log.id && log.details}
							<tr class="detail-row">
								<td colspan="6">
									<div class="detail-content">
										{#if log.details.changes}
											<table class="changes-table">
												<thead><tr><th>Field</th><th>From</th><th>To</th></tr></thead>
												<tbody>
													{#each log.details.changes as change}
														<tr>
															<td class="cf">{change.field}</td>
															<td class="cv old">{change.from ?? '—'}</td>
															<td class="cv new">{change.to ?? '—'}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{:else}
											<pre class="detail-json">{JSON.stringify(log.details, null, 2)}</pre>
										{/if}
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		<div class="pagination">
			<span class="pg-info">Showing {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize, totalCount)} of {totalCount}</span>
			<div class="pg-btns">
				<button class="pg-btn" disabled={currentPage <= 1} onclick={() => { currentPage--; loadLogs(); }}>‹</button>
				<span class="pg-num">{currentPage} / {totalPages}</span>
				<button class="pg-btn" disabled={currentPage >= totalPages} onclick={() => { currentPage++; loadLogs(); }}>›</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.audit-window { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 12px; }
	.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
	.search-box { display: flex; gap: 6px; flex: 1; min-width: 200px; }
	.search-box input { flex: 1; padding: 7px 12px; border: 1.5px solid var(--color-border); border-radius: 6px; font-size: 13px; }
	.search-box input:focus { outline: none; border-color: var(--color-primary); }
	.filter-select { padding: 7px 10px; border: 1.5px solid var(--color-border); border-radius: 6px; font-size: 13px; background: white; }
	.btn-sm { padding: 7px 14px; border: 1px solid var(--color-border); border-radius: 5px; background: white; font-size: 12px; cursor: pointer; }
	.btn-sm:hover { background: var(--color-bg); }

	.center-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); font-size: 14px; }

	.table-wrap { flex: 1; overflow: auto; border: 1px solid var(--color-border-light); border-radius: 8px; }
	.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.data-table thead { background: var(--color-bg-alt); position: sticky; top: 0; z-index: 2; }
	.data-table th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border); }
	.data-table td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-light); }
	.log-row { cursor: pointer; transition: background 0.1s; }
	.log-row:hover td { background: var(--color-surface-hover); }

	.col-time { white-space: nowrap; font-size: 12px; color: var(--color-text-secondary); min-width: 150px; }
	.col-user { font-weight: 500; min-width: 100px; }
	.col-action { min-width: 120px; }
	.col-resource { text-transform: capitalize; min-width: 80px; }
	.col-target { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.action-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; }
	.act-green { background: #dcfce7; color: #166534; }
	.act-red { background: #fde8e8; color: #991b1b; }
	.act-orange { background: #fef3c7; color: #92400e; }
	.act-blue { background: #dbeafe; color: #1e40af; }

	.change-count { font-size: 11px; color: var(--color-primary); font-weight: 500; }
	.has-details { font-size: 14px; }

	.detail-row td { padding: 0 !important; background: var(--color-bg-alt); }
	.detail-content { padding: 12px 16px; }
	.changes-table { width: 100%; border-collapse: collapse; font-size: 12px; background: white; border-radius: 6px; overflow: hidden; }
	.changes-table th { padding: 6px 10px; background: var(--color-bg); font-size: 11px; text-align: left; text-transform: uppercase; letter-spacing: 0.4px; }
	.changes-table td { padding: 6px 10px; border-top: 1px solid var(--color-border-light); }
	.cf { font-weight: 500; color: var(--color-text-secondary); }
	.cv.old { color: #991b1b; text-decoration: line-through; }
	.cv.new { color: #166534; font-weight: 500; }
	.detail-json { font-size: 11px; background: white; padding: 8px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }

	.pagination { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; }
	.pg-info { font-size: 12px; color: var(--color-text-secondary); }
	.pg-btns { display: flex; align-items: center; gap: 8px; }
	.pg-btn { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--color-border); background: white; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
	.pg-btn:disabled { opacity: 0.4; cursor: default; }
	.pg-num { font-size: 12px; color: var(--color-text-secondary); }
</style>
