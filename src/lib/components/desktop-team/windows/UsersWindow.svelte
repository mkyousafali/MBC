<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog, diffChanges } from '$lib/utils/audit';

	const RESOURCE_KEY = 'settings.management.users';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	type JobTitle = { id: string; title_code: string; title_name: string; department_name: string; display_order: number };
	type Branch = { id: string; branch_code: string; branch_name: string; address: string | null; district: string | null; state: string | null };
	type EmployeeUser = {
		user_id: string; employee_id: string; employee_code: string;
		full_name: string; username: string; whatsapp_number: string;
		email: string | null; job_title_id: string; job_title_name: string;
		salary_amount: number; salary_type: string; salary_day: string | null;
		joining_date: string; employment_status: string;
		branch_id: string | null; branch_name: string | null;
		is_active: boolean; created_at: string;
	};

	let activeTab: 'list' | 'create' | 'edit' = $state('list');
	let loading = $state(false);
	let jobTitles = $state<JobTitle[]>([]);
	let branches = $state<Branch[]>([]);

	// List state
	let employees = $state<EmployeeUser[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let statusFilter = $state('');
	let jobTitleFilter = $state('');
	let currentPage = $state(1);
	const pageSize = 15;

	// Create form state
	let createForm = $state({
		full_name: '', username: '', password: '', quick_access_code: '',
		is_active: true, whatsapp_number: '', email: '', job_title_id: '',
		salary_amount: 0, salary_type: 'monthly', salary_day: '',
		joining_date: '', id_type: 'Aadhaar',
		id_number: '', state: '', district: '', known_languages: '',
		branch_id: ''
	});
	let createLoading = $state(false);
	let usernameAvailable = $state<boolean | null>(null);
	let usernameChecking = $state(false);

	// Edit state
	let editUserId = $state('');
	let editForm = $state<any>(null);
	let editFormOriginalJson = '';
	let editLoading = $state(false);
	let selectedEmployee = $state<EmployeeUser | null>(null);

	async function loadJobTitles() {
		const { data, error } = await supabase.rpc('rpc_get_active_job_titles');
		if (error) { toasts.add('Failed to load job titles', 'error'); return; }
		jobTitles = data || [];
	}

	async function loadBranches() {
		const { data, error } = await supabase.rpc('rpc_get_active_branches');
		if (error) { toasts.add('Failed to load branches', 'error'); return; }
		branches = data || [];
	}

	async function loadEmployees() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_list_employee_users', {
			p_search: searchQuery,
			p_status_filter: statusFilter || null,
			p_job_title_filter: jobTitleFilter || null,
			p_sort_by: 'created_at',
			p_sort_dir: 'desc',
			p_limit: pageSize,
			p_offset: (currentPage - 1) * pageSize
		});
		loading = false;
		if (error) { toasts.add('Failed to load employees: ' + error.message, 'error'); return; }
		employees = data?.data || [];
		totalCount = data?.total || 0;
	}

	async function hashValue(val: string): Promise<string> {
		const encoded = new TextEncoder().encode(val);
		const buf = await crypto.subtle.digest('SHA-256', encoded);
		return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
	}

	let usernameTimer: ReturnType<typeof setTimeout> | null = null;
	function onUsernameInput() {
		usernameAvailable = null;
		if (usernameTimer) clearTimeout(usernameTimer);
		if (createForm.username.trim().length < 3) return;
		usernameTimer = setTimeout(async () => {
			usernameChecking = true;
			const { data } = await supabase.rpc('rpc_check_username_availability', { p_username: createForm.username.trim() });
			usernameAvailable = data?.available ?? null;
			usernameChecking = false;
		}, 500);
	}

	async function toggleUserStatus(emp: EmployeeUser) {
		const newActive = emp.employment_status !== 'active';
		const newStatus = newActive ? 'active' : 'inactive';
		const { data, error } = await supabase.rpc('rpc_update_employee_user', {
			p_user_id: emp.user_id,
			p_is_active: newActive,
			p_employment_status: newStatus
		});
		if (error) { toasts.add('Failed to update status: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Update failed', 'error'); return; }
		emp.employment_status = newStatus;
		emp.is_active = newActive;
		employees = [...employees];
		toasts.add(`${emp.full_name} is now ${newStatus}`, 'success');
		writeAuditLog({ action: 'status_change', resourceType: 'user', resourceId: emp.user_id, resourceLabel: emp.full_name, changes: [{ field: 'status', from: newActive ? 'inactive' : 'active', to: newStatus }] });
	}

	async function generateQAC() {
		const { data } = await supabase.rpc('rpc_generate_quick_access_code');
		if (data?.code) createForm.quick_access_code = data.code;
	}

	async function handleCreate() {
		if (!createForm.full_name.trim()) { toasts.add('Employee name is required', 'error'); return; }
		if (!createForm.username.trim()) { toasts.add('Username is required', 'error'); return; }
		if (createForm.password.length < 8) { toasts.add('Password must be at least 8 characters', 'error'); return; }
		if (!/^\d{6}$/.test(createForm.quick_access_code)) { toasts.add('Quick Access Code must be exactly 6 digits', 'error'); return; }
		if (!createForm.job_title_id) { toasts.add('Job title is required', 'error'); return; }
		if (!createForm.whatsapp_number.trim()) { toasts.add('WhatsApp number is required', 'error'); return; }
		if (!createForm.joining_date) { toasts.add('Joining date is required', 'error'); return; }
		if (!createForm.id_type.trim()) { toasts.add('ID type is required', 'error'); return; }
		if (!createForm.id_number.trim()) { toasts.add('ID number is required', 'error'); return; }
		if (!createForm.state.trim()) { toasts.add('State is required', 'error'); return; }
		if (!createForm.district.trim()) { toasts.add('District is required', 'error'); return; }
		if (createForm.salary_type === 'weekly' && !createForm.salary_day) { toasts.add('Salary day is required for weekly salary', 'error'); return; }

		createLoading = true;
		const passwordHash = await hashValue(createForm.password);
		const qacHash = await hashValue(createForm.quick_access_code);
		const languages = createForm.known_languages.split(',').map((l: string) => l.trim()).filter(Boolean);

		const { data, error } = await supabase.rpc('rpc_create_employee_user', {
			p_full_name: createForm.full_name.trim(),
			p_username: createForm.username.trim(),
			p_password_hash: passwordHash,
			p_quick_access_code_hash: qacHash,
			p_is_active: createForm.is_active,
			p_whatsapp_number: createForm.whatsapp_number.trim(),
			p_email: createForm.email.trim() || null,
			p_job_title_id: createForm.job_title_id,
			p_salary_amount: createForm.salary_amount,
			p_salary_type: createForm.salary_type,
			p_salary_day: createForm.salary_type === 'weekly' ? createForm.salary_day : null,
			p_joining_date: createForm.joining_date,
			p_id_type: createForm.id_type.trim(),
			p_id_number: createForm.id_number.trim(),
			p_state: createForm.state.trim(),
			p_district: createForm.district.trim(),
			p_known_languages: languages,
			p_branch_id: createForm.branch_id || null
		});
		createLoading = false;

		if (error) { toasts.add('Create failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Create failed', 'error'); return; }

		toasts.add(`Employee ${data.employee_code} created successfully!`, 'success');
		writeAuditLog({ action: 'create', resourceType: 'user', resourceId: data.user_id || '', resourceLabel: createForm.full_name.trim(), details: { employee_code: data.employee_code, username: createForm.username.trim() } });
		resetCreateForm();
		activeTab = 'list';
		await loadEmployees();
	}

	function resetCreateForm() {
		createForm = {
			full_name: '', username: '', password: '', quick_access_code: '',
			is_active: true, whatsapp_number: '', email: '', job_title_id: '',
			salary_amount: 0, salary_type: 'monthly', salary_day: '',
			joining_date: '', id_type: 'Aadhaar',
			id_number: '', state: '', district: '', known_languages: '',
			branch_id: ''
		};
		usernameAvailable = null;
	}

	async function startEdit(emp: EmployeeUser) {
		selectedEmployee = emp;
		editUserId = emp.user_id;
		editLoading = true;
		const { data, error } = await supabase.rpc('rpc_get_employee_user', { p_user_id: emp.user_id });
		editLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load user details', 'error'); return; }
		const d = data.data;
		editForm = {
			full_name: d.full_name, username: d.username, is_active: d.is_active,
			whatsapp_number: d.whatsapp_number, email: d.email || '',
			job_title_id: d.job_title_id, salary_amount: d.salary_amount,
			salary_type: d.salary_type || 'monthly', salary_day: d.salary_day || '',
			joining_date: d.joining_date, id_type: d.id_type, id_number: '',
			state: d.state, district: d.district,
			known_languages: (d.known_languages || []).join(', '),
			employment_status: d.employment_status,
			branch_id: d.branch_id || '',
			password: '', quick_access_code: ''
		};
		editFormOriginalJson = JSON.stringify(editForm);
		activeTab = 'edit';
	}

	async function handleUpdate() {
		if (!editForm) return;
		editLoading = true;

		let passwordHash: string | null = null;
		let qacHash: string | null = null;
		if (editForm.password && editForm.password.length >= 8) passwordHash = await hashValue(editForm.password);
		if (editForm.quick_access_code && /^\d{6}$/.test(editForm.quick_access_code)) qacHash = await hashValue(editForm.quick_access_code);

		const languages = editForm.known_languages.split(',').map((l: string) => l.trim()).filter(Boolean);

		const { data, error } = await supabase.rpc('rpc_update_employee_user', {
			p_user_id: editUserId,
			p_full_name: editForm.full_name.trim() || null,
			p_username: editForm.username.trim() || null,
			p_is_active: editForm.is_active,
			p_whatsapp_number: editForm.whatsapp_number.trim() || null,
			p_email: editForm.email,
			p_job_title_id: editForm.job_title_id || null,
			p_salary_amount: editForm.salary_amount,
			p_salary_type: editForm.salary_type,
			p_salary_day: editForm.salary_type === 'weekly' ? editForm.salary_day : null,
			p_joining_date: editForm.joining_date || null,
			p_id_type: editForm.id_type.trim() || null,
			p_id_number: editForm.id_number.trim() || null,
			p_state: editForm.state.trim() || null,
			p_district: editForm.district.trim() || null,
			p_known_languages: languages,
			p_employment_status: editForm.employment_status || null,
			p_password_hash: passwordHash,
			p_quick_access_code_hash: qacHash,
			p_branch_id: editForm.branch_id || null
		});
		editLoading = false;

		if (error) { toasts.add('Update failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Update failed', 'error'); return; }

		toasts.add('Employee updated successfully!', 'success');
		const originalForm = JSON.parse(editFormOriginalJson);
		const currentForm = { full_name: editForm.full_name, username: editForm.username, is_active: editForm.is_active, whatsapp_number: editForm.whatsapp_number, email: editForm.email, job_title_id: editForm.job_title_id, salary_amount: editForm.salary_amount, salary_type: editForm.salary_type, salary_day: editForm.salary_day, joining_date: editForm.joining_date, state: editForm.state, district: editForm.district, known_languages: editForm.known_languages, employment_status: editForm.employment_status, branch_id: editForm.branch_id };
		const changes = diffChanges(originalForm, currentForm, ['full_name','username','is_active','whatsapp_number','email','job_title_id','salary_amount','salary_type','salary_day','joining_date','state','district','known_languages','employment_status','branch_id']);
		if (editForm.password) {
			changes.push({ field: 'password', from: '***', to: '(changed)' });
		}
		writeAuditLog({ action: 'update', resourceType: 'user', resourceId: editUserId, resourceLabel: currentForm.full_name, changes });
		activeTab = 'list';
		editForm = null;
		editFormOriginalJson = '';
		await loadEmployees();
	}

	$effect(() => { loadJobTitles(); loadBranches(); loadEmployees(); });

	const totalPages = $derived(Math.ceil(totalCount / pageSize));
	function doSearch() { currentPage = 1; loadEmployees(); }

	let jtSearch = $state('');
	const filteredJobTitles = $derived(
		jtSearch.trim() ? jobTitles.filter(jt => jt.title_name.toLowerCase().includes(jtSearch.toLowerCase())) : jobTitles
	);

	function closeCustomPickers(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.branch-picker')) {
			document.querySelectorAll('.branch-picker.open').forEach(el => el.classList.remove('open'));
		}
		if (!target.closest('.jt-picker')) {
			document.querySelectorAll('.jt-picker.open').forEach(el => el.classList.remove('open'));
			jtSearch = '';
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="users-window" onclick={closeCustomPickers} onkeydown={() => {}}>
	<div class="toolbar">
		<button class="toolbar-btn" class:active={activeTab === 'list'} onclick={() => { activeTab = 'list'; loadEmployees(); }}>📋 User List</button>
		{#if permAdd}
			<button class="toolbar-btn" class:active={activeTab === 'create'} onclick={() => { activeTab = 'create'; resetCreateForm(); }}>➕ Create User</button>
		{/if}
		{#if activeTab === 'edit'}
			<button class="toolbar-btn active">✏️ Edit User</button>
		{/if}
	</div>

	<div class="tab-content">
		{#if activeTab === 'list'}
			<div class="list-controls">
				<div class="search-box">
					<input type="text" placeholder="Search name, code, username..." bind:value={searchQuery} onkeydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
					<button class="btn-sm" onclick={doSearch}>Search</button>
				</div>
				<select class="filter-select" bind:value={statusFilter} onchange={doSearch}>
					<option value="">All Statuses</option>
					<option value="active">Active</option>
					<option value="inactive">Inactive</option>
					<option value="on_leave">On Leave</option>
					<option value="suspended">Suspended</option>
					<option value="terminated">Terminated</option>
					<option value="resigned">Resigned</option>
				</select>
				<select class="filter-select" bind:value={jobTitleFilter} onchange={doSearch}>
					<option value="">All Job Titles</option>
					{#each jobTitles as jt}
						<option value={jt.id}>{jt.title_name}</option>
					{/each}
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
							<th>Code</th><th>Name</th><th>Username</th><th>Branch</th><th>Job Title</th>
							<th>WhatsApp</th><th>Salary</th><th>Status</th><th>Actions</th>
						</tr></thead>
						<tbody>
							{#each employees as emp}
								<tr>
									<td class="mono">{emp.employee_code}</td>
									<td>{emp.full_name}</td>
									<td class="mono">{emp.username}</td>
									<td>{emp.branch_name || '—'}</td>
									<td>{emp.job_title_name}</td>
									<td>{emp.whatsapp_number}</td>
							<td class="num">₹{emp.salary_amount.toLocaleString()} <span class="sal-type">/{emp.salary_type}</span></td>
									<td><span class="status-badge" class:st-active={emp.employment_status === 'active'} class:st-inactive={emp.employment_status !== 'active'}>{emp.employment_status}</span></td>
								<td class="actions-cell">
									{#if permEdit}<button class="btn-sm" onclick={() => startEdit(emp)}>Edit</button>{/if}
									<button
										class="status-toggle"
										class:active={emp.employment_status === 'active'}
										disabled={!permEdit}
										title={permEdit ? (emp.employment_status === 'active' ? 'Deactivate' : 'Activate') : 'No permission'}
										onclick={() => toggleUserStatus(emp)}
									>
										<span class="toggle-knob"></span>
									</button>
								</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="pagination">
					<span class="pg-info">Showing {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize, totalCount)} of {totalCount}</span>
					<div class="pg-btns">
						<button class="btn-sm" disabled={currentPage <= 1} onclick={() => { currentPage--; loadEmployees(); }}>← Prev</button>
						<span class="pg-num">Page {currentPage}/{totalPages}</span>
						<button class="btn-sm" disabled={currentPage >= totalPages} onclick={() => { currentPage++; loadEmployees(); }}>Next →</button>
					</div>
				</div>
			{/if}

		{:else if activeTab === 'create'}
			<form class="user-form" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
				<h3 class="sec-title">Login Information</h3>
				<div class="form-grid">
					<div class="field"><label for="c-name">Employee Name *</label><input id="c-name" type="text" bind:value={createForm.full_name} required /></div>
					<div class="field">
						<label for="c-user">Username *</label>
						<input id="c-user" type="text" bind:value={createForm.username} oninput={onUsernameInput} required />
						{#if usernameChecking}<span class="fhint">Checking...</span>
						{:else if usernameAvailable === true}<span class="fhint ok">✓ Available</span>
						{:else if usernameAvailable === false}<span class="fhint no">✗ Taken</span>{/if}
					</div>
					<div class="field"><label for="c-pass">Password * <small>(min 8 chars)</small></label><input id="c-pass" type="password" bind:value={createForm.password} minlength="8" required /></div>
					<div class="field">
						<label for="c-qac">Quick Access Code * <small>(6 digits)</small></label>
						<div class="input-row"><input id="c-qac" type="text" bind:value={createForm.quick_access_code} pattern={"\\d{6}"} maxlength="6" required /><button type="button" class="btn-sm" onclick={generateQAC}>Generate</button></div>
					</div>
					<div class="field"><label for="c-active">Account Status</label><select id="c-active" bind:value={createForm.is_active}><option value={true}>Active</option><option value={false}>Inactive</option></select></div>
				</div>

				<h3 class="sec-title">Employee Information</h3>
				<div class="form-grid">
					<div class="field"><label for="c-wa">WhatsApp Number *</label><input id="c-wa" type="text" bind:value={createForm.whatsapp_number} required /></div>
					<div class="field"><label for="c-email">Email Address</label><input id="c-email" type="email" bind:value={createForm.email} /></div>
					<div class="field branch-field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label>Branch</label>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="branch-picker" onclick={(e) => { e.currentTarget.classList.toggle('open'); }} onkeydown={() => {}}>
							<div class="branch-selected">
								{#if createForm.branch_id}
									{@const sel = branches.find(b => b.id === createForm.branch_id)}
									<span class="bp-name">{sel?.branch_name ?? ''}</span>
									{#if sel?.address || sel?.district}
										<span class="bp-loc"><span class="bp-scroll">{[sel.address, sel.district, sel.state].filter(Boolean).join(', ')}</span></span>
									{/if}
								{:else}
									<span class="bp-placeholder">Select branch</span>
								{/if}
								<span class="bp-arrow">▾</span>
							</div>
							<div class="branch-options">
								<button type="button" class="branch-opt" onclick={() => { createForm.branch_id = ''; }}>
									<span class="bp-name">— None —</span>
								</button>
								{#each branches as br}
									<button type="button" class="branch-opt" class:selected={createForm.branch_id === br.id} onclick={() => { createForm.branch_id = br.id; }}>
										<span class="bp-name">{br.branch_name}</span>
										<span class="bp-loc"><span class="bp-scroll">{[br.address, br.district, br.state].filter(Boolean).join(', ')}</span></span>
									</button>
								{/each}
							</div>
						</div>
					</div>
					<div class="field jt-field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label>Job Title *</label>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="jt-picker" onclick={(e) => { e.stopPropagation(); e.currentTarget.classList.add('open'); }} onkeydown={() => {}}>
							<div class="jt-selected">
								{#if createForm.job_title_id}
									{@const sel = jobTitles.find(j => j.id === createForm.job_title_id)}
									<span class="jt-name">{sel?.title_name ?? ''}</span>
									{#if sel?.department_name}<span class="jt-dept">{sel.department_name}</span>{/if}
								{:else}
									<span class="jt-placeholder">Select job title</span>
								{/if}
								<span class="jt-arrow">▾</span>
							</div>
							<div class="jt-options">
								<div class="jt-search-wrap">
									<input type="text" class="jt-search" placeholder="Search job titles..." bind:value={jtSearch} onclick={(e) => e.stopPropagation()} />
								</div>
								<div class="jt-list">
									{#each filteredJobTitles as jt}
										<button type="button" class="jt-opt" class:selected={createForm.job_title_id === jt.id} onclick={() => { createForm.job_title_id = jt.id; jtSearch = ''; }}>
											<span class="jt-name">{jt.title_name}</span>
											<span class="jt-dept">{jt.department_name}</span>
										</button>
									{:else}
										<div class="jt-empty">No matches</div>
									{/each}
								</div>
							</div>
						</div>
					</div>
					<div class="field"><label for="c-sal">Salary Amount (₹)</label><input id="c-sal" type="number" bind:value={createForm.salary_amount} min="0" step="0.01" /></div>
					<div class="field"><label for="c-stype">Salary Type *</label><select id="c-stype" bind:value={createForm.salary_type} required><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
					{#if createForm.salary_type === 'weekly'}
						<div class="field"><label for="c-sday">Salary Day *</label><select id="c-sday" bind:value={createForm.salary_day} required><option value="">Select day</option><option value="monday">Monday</option><option value="tuesday">Tuesday</option><option value="wednesday">Wednesday</option><option value="thursday">Thursday</option><option value="friday">Friday</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option></select></div>
					{/if}
					<div class="field"><label for="c-join">Joining Date *</label><input id="c-join" type="date" bind:value={createForm.joining_date} required /></div>
					<div class="field"><label for="c-idt">ID Type *</label><select id="c-idt" bind:value={createForm.id_type} required><option value="Aadhaar">Aadhaar</option><option value="PAN">PAN</option><option value="Passport">Passport</option><option value="Voter ID">Voter ID</option><option value="Driving License">Driving License</option></select></div>
					<div class="field"><label for="c-idn">ID Number *</label><input id="c-idn" type="text" bind:value={createForm.id_number} required /></div>
					<div class="field"><label for="c-st">State *</label><input id="c-st" type="text" bind:value={createForm.state} required /></div>
					<div class="field"><label for="c-dt">District *</label><input id="c-dt" type="text" bind:value={createForm.district} required /></div>
					<div class="field"><label for="c-lang">Known Languages <small>(comma separated)</small></label><input id="c-lang" type="text" bind:value={createForm.known_languages} placeholder="Malayalam, English, Hindi" /></div>
				</div>

				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={() => { activeTab = 'list'; resetCreateForm(); }}>Cancel</button>
					<button type="submit" class="btn-save" disabled={createLoading}>{createLoading ? 'Creating...' : 'Create Employee'}</button>
				</div>
			</form>

		{:else if activeTab === 'edit' && editForm}
			<div class="edit-header"><span class="edit-code">{selectedEmployee?.employee_code}</span><span class="edit-name">{selectedEmployee?.full_name}</span></div>
			<form class="user-form" onsubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
				<h3 class="sec-title">Login Information</h3>
				<div class="form-grid">
					<div class="field"><label for="e-name">Employee Name</label><input id="e-name" type="text" bind:value={editForm.full_name} /></div>
					<div class="field"><label for="e-user">Username</label><input id="e-user" type="text" bind:value={editForm.username} /></div>
					<div class="field"><label for="e-pass">New Password <small>(blank = keep)</small></label><input id="e-pass" type="password" bind:value={editForm.password} minlength="8" /></div>
					<div class="field"><label for="e-qac">New QAC <small>(blank = keep)</small></label><input id="e-qac" type="text" bind:value={editForm.quick_access_code} maxlength="6" /></div>
					<div class="field"><label for="e-act">Account Status</label><select id="e-act" bind:value={editForm.is_active}><option value={true}>Active</option><option value={false}>Inactive</option></select></div>
					<div class="field"><label for="e-est">Employment Status</label><select id="e-est" bind:value={editForm.employment_status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option><option value="suspended">Suspended</option><option value="terminated">Terminated</option><option value="resigned">Resigned</option></select></div>
				</div>

				<h3 class="sec-title">Employee Information</h3>
				<div class="form-grid">
					<div class="field"><label for="e-wa">WhatsApp Number</label><input id="e-wa" type="text" bind:value={editForm.whatsapp_number} /></div>
					<div class="field"><label for="e-em">Email Address</label><input id="e-em" type="email" bind:value={editForm.email} /></div>
					<div class="field branch-field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label>Branch</label>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="branch-picker" onclick={(e) => { e.currentTarget.classList.toggle('open'); }} onkeydown={() => {}}>
							<div class="branch-selected">
								{#if editForm.branch_id}
									{@const sel = branches.find(b => b.id === editForm.branch_id)}
									<span class="bp-name">{sel?.branch_name ?? ''}</span>
									{#if sel?.address || sel?.district}
										<span class="bp-loc"><span class="bp-scroll">{[sel.address, sel.district, sel.state].filter(Boolean).join(', ')}</span></span>
									{/if}
								{:else}
									<span class="bp-placeholder">Select branch</span>
								{/if}
								<span class="bp-arrow">▾</span>
							</div>
							<div class="branch-options">
								<button type="button" class="branch-opt" onclick={() => { editForm.branch_id = ''; }}>
									<span class="bp-name">— None —</span>
								</button>
								{#each branches as br}
									<button type="button" class="branch-opt" class:selected={editForm.branch_id === br.id} onclick={() => { editForm.branch_id = br.id; }}>
										<span class="bp-name">{br.branch_name}</span>
										<span class="bp-loc"><span class="bp-scroll">{[br.address, br.district, br.state].filter(Boolean).join(', ')}</span></span>
									</button>
								{/each}
							</div>
						</div>
					</div>
					<div class="field jt-field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label>Job Title</label>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="jt-picker" onclick={(e) => { e.stopPropagation(); e.currentTarget.classList.add('open'); }} onkeydown={() => {}}>
							<div class="jt-selected">
								{#if editForm.job_title_id}
									{@const sel = jobTitles.find(j => j.id === editForm.job_title_id)}
									<span class="jt-name">{sel?.title_name ?? ''}</span>
									{#if sel?.department_name}<span class="jt-dept">{sel.department_name}</span>{/if}
								{:else}
									<span class="jt-placeholder">Select job title</span>
								{/if}
								<span class="jt-arrow">▾</span>
							</div>
							<div class="jt-options">
								<div class="jt-search-wrap">
									<input type="text" class="jt-search" placeholder="Search job titles..." bind:value={jtSearch} onclick={(e) => e.stopPropagation()} />
								</div>
								<div class="jt-list">
									{#each filteredJobTitles as jt}
										<button type="button" class="jt-opt" class:selected={editForm.job_title_id === jt.id} onclick={() => { editForm.job_title_id = jt.id; jtSearch = ''; }}>
											<span class="jt-name">{jt.title_name}</span>
											<span class="jt-dept">{jt.department_name}</span>
										</button>
									{:else}
										<div class="jt-empty">No matches</div>
									{/each}
								</div>
							</div>
						</div>
					</div>
					<div class="field"><label for="e-sal">Salary Amount (₹)</label><input id="e-sal" type="number" bind:value={editForm.salary_amount} min="0" step="0.01" /></div>
					<div class="field"><label for="e-stype">Salary Type</label><select id="e-stype" bind:value={editForm.salary_type}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
					{#if editForm.salary_type === 'weekly'}
						<div class="field"><label for="e-sday">Salary Day</label><select id="e-sday" bind:value={editForm.salary_day}><option value="">Select day</option><option value="monday">Monday</option><option value="tuesday">Tuesday</option><option value="wednesday">Wednesday</option><option value="thursday">Thursday</option><option value="friday">Friday</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option></select></div>
					{/if}
					<div class="field"><label for="e-join">Joining Date</label><input id="e-join" type="date" bind:value={editForm.joining_date} /></div>
					<div class="field"><label for="e-idt">ID Type</label><select id="e-idt" bind:value={editForm.id_type}><option value="Aadhaar">Aadhaar</option><option value="PAN">PAN</option><option value="Passport">Passport</option><option value="Voter ID">Voter ID</option><option value="Driving License">Driving License</option></select></div>
					<div class="field"><label for="e-idn">ID Number <small>(blank = keep)</small></label><input id="e-idn" type="text" bind:value={editForm.id_number} /></div>
					<div class="field"><label for="e-st">State</label><input id="e-st" type="text" bind:value={editForm.state} /></div>
					<div class="field"><label for="e-dt">District</label><input id="e-dt" type="text" bind:value={editForm.district} /></div>
					<div class="field"><label for="e-lang">Known Languages <small>(comma separated)</small></label><input id="e-lang" type="text" bind:value={editForm.known_languages} /></div>
				</div>

				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={() => { activeTab = 'list'; editForm = null; }}>Cancel</button>
					<button type="submit" class="btn-save" disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</button>
				</div>
			</form>

		{:else if activeTab === 'edit' && !editForm}
			<div class="center-state">Select an employee from the list to edit.</div>
		{/if}
	</div>
</div>

<style>
	.users-window { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
	.toolbar { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border); margin-bottom: 12px; flex-shrink: 0; }
	.toolbar-btn { padding: 8px 16px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-white); color: var(--color-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
	.toolbar-btn:hover { background: var(--color-bg); }
	.toolbar-btn.active { background: #0E5A3C; color: white; border-color: #0E5A3C; }
	.toolbar-btn:disabled { opacity: 0.5; cursor: default; }
	.tab-content { flex: 1; overflow-y: auto; }

	.list-controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
	.search-box { display: flex; gap: 4px; flex: 1; min-width: 200px; }
	.search-box input { flex: 1; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; outline: none; }
	.search-box input:focus { border-color: #0E5A3C; }
	.filter-select { padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; background: white; cursor: pointer; }

	.table-wrap { overflow-x: auto; }
	.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.data-table th { text-align: left; padding: 8px 10px; background: var(--color-bg); font-weight: 600; color: var(--color-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid var(--color-border); white-space: nowrap; }
	.data-table td { padding: 8px 10px; border-bottom: 1px solid var(--color-border); }
	.data-table tbody tr:hover { background: var(--color-bg); }
	.mono { font-family: monospace; font-size: 12px; }
	.num { text-align: right; font-family: monospace; }
	.status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
	.st-active { background: #e6f0eb; color: #0E5A3C; }
	.st-inactive { background: #fef2f2; color: #dc2626; }
	.sal-type { font-size: 10px; color: var(--color-text-secondary); text-transform: capitalize; }

	.pagination { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--color-border); margin-top: 8px; }
	.pg-info { font-size: 12px; color: var(--color-text-secondary); }
	.pg-btns { display: flex; align-items: center; gap: 8px; }
	.pg-num { font-size: 12px; color: var(--color-text-secondary); }

	.btn-sm { padding: 5px 12px; border: 1px solid var(--color-border); border-radius: 5px; background: white; font-size: 12px; cursor: pointer; transition: background 0.12s; }
	.btn-sm:hover:not(:disabled) { background: var(--color-bg); }
	.btn-sm:disabled { opacity: 0.5; cursor: default; }

	.actions-cell { display: flex; align-items: center; gap: 6px; }
	.status-toggle {
		width: 36px; height: 20px; border-radius: 10px; border: none;
		background: #ccc; cursor: pointer; position: relative; transition: background 0.2s; padding: 0; flex-shrink: 0;
	}
	.status-toggle.active { background: #22c55e; }
	.status-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
	.status-toggle .toggle-knob {
		position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
		border-radius: 50%; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
		transition: transform 0.2s;
	}
	.status-toggle.active .toggle-knob { transform: translateX(16px); }

	.user-form { padding-bottom: 24px; }
	.sec-title { font-size: 14px; font-weight: 600; color: #0E5A3C; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border); }
	.sec-title:first-child { margin-top: 0; }
	.form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
	.field { display: flex; flex-direction: column; gap: 4px; }
	.field label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
	.field label small { font-weight: 400; }
	.field input, .field select { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; outline: none; background: white; }
	.field input:focus, .field select:focus { border-color: #0E5A3C; }
	.fhint { font-size: 11px; }
	.fhint.ok { color: #16a34a; }
	.fhint.no { color: #dc2626; }
	.input-row { display: flex; gap: 6px; }
	.input-row input { flex: 1; }
	.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--color-border); }
	.btn-cancel { padding: 8px 20px; border: 1px solid var(--color-border); border-radius: 6px; background: white; font-size: 13px; cursor: pointer; }
	.btn-cancel:hover { background: var(--color-bg); }
	.btn-save { padding: 8px 24px; border: none; border-radius: 6px; background: #0E5A3C; color: white; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-save:hover:not(:disabled) { background: #0A3F2C; }
	.btn-save:disabled { opacity: 0.6; cursor: default; }
	.edit-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
	.edit-code { background: var(--color-bg); padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: 600; color: #0E5A3C; }
	.edit-name { font-size: 15px; font-weight: 600; }
	.center-state { display: flex; align-items: center; justify-content: center; padding: 48px; color: var(--color-text-secondary); font-size: 14px; }

	/* Branch custom picker */
	.branch-field { position: relative; }
	.branch-picker { position: relative; cursor: pointer; }
	.branch-selected {
		display: flex; flex-direction: column; gap: 1px;
		padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px;
		background: white; min-height: 36px; position: relative;
	}
	:global(.branch-picker.open) .branch-selected { border-color: #0E5A3C; border-radius: 6px 6px 0 0; }
	.bp-placeholder { font-size: 13px; color: #999; }
	.bp-arrow { position: absolute; right: 10px; top: 8px; font-size: 12px; color: #999; }
	.bp-name { font-size: 13px; font-weight: 500; color: var(--color-text); line-height: 1.2; }
	.bp-loc {
		display: block; overflow: hidden; white-space: nowrap; max-width: 100%;
		font-size: 11px; color: var(--color-text-secondary); line-height: 1.2;
	}
	.bp-scroll {
		display: inline-block; white-space: nowrap;
		animation: bp-marquee 8s linear infinite;
	}
	.bp-loc:hover .bp-scroll { animation-play-state: paused; }
	@keyframes bp-marquee {
		0% { transform: translateX(100%); }
		100% { transform: translateX(-100%); }
	}
	.branch-options {
		display: none; position: absolute; top: 100%; left: 0; right: 0;
		background: white; border: 1px solid #0E5A3C; border-top: none;
		border-radius: 0 0 6px 6px; z-index: 20; max-height: 200px; overflow-y: auto;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
	}
	:global(.branch-picker.open) .branch-options { display: block; }
	.branch-opt {
		display: flex; flex-direction: column; gap: 1px; width: 100%;
		padding: 8px 10px; border: none; background: white;
		text-align: left; cursor: pointer; transition: background 0.1s;
	}
	.branch-opt:hover { background: var(--color-bg); }
	.branch-opt.selected { background: #e6f0eb; }
	.branch-opt .bp-name { font-size: 13px; }
	.branch-opt .bp-loc { font-size: 11px; }
	.branch-opt .bp-scroll { animation: bp-marquee-opt 6s linear infinite; }
	@keyframes bp-marquee-opt {
		0% { transform: translateX(100%); }
		100% { transform: translateX(-100%); }
	}

	/* Job Title searchable picker */
	.jt-field { position: relative; }
	.jt-picker { position: relative; cursor: pointer; }
	.jt-selected {
		display: flex; flex-direction: column; gap: 1px;
		padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px;
		background: white; min-height: 36px; position: relative;
	}
	:global(.jt-picker.open) .jt-selected { border-color: #0E5A3C; border-radius: 6px 6px 0 0; }
	.jt-placeholder { font-size: 13px; color: #999; }
	.jt-arrow { position: absolute; right: 10px; top: 8px; font-size: 12px; color: #999; }
	.jt-name { font-size: 13px; font-weight: 500; color: var(--color-text); line-height: 1.2; }
	.jt-dept { font-size: 11px; color: var(--color-text-secondary); line-height: 1.2; }
	.jt-options {
		display: none; position: absolute; top: 100%; left: 0; right: 0;
		background: white; border: 1px solid #0E5A3C; border-top: none;
		border-radius: 0 0 6px 6px; z-index: 20;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
	}
	:global(.jt-picker.open) .jt-options { display: block; }
	.jt-search-wrap { padding: 6px; border-bottom: 1px solid var(--color-border); }
	.jt-search {
		width: 100%; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 4px;
		font-size: 12px; outline: none; box-sizing: border-box;
	}
	.jt-search:focus { border-color: #0E5A3C; }
	.jt-list { max-height: 180px; overflow-y: auto; }
	.jt-opt {
		display: flex; flex-direction: column; gap: 1px; width: 100%;
		padding: 7px 10px; border: none; background: white;
		text-align: left; cursor: pointer; transition: background 0.1s;
	}
	.jt-opt:hover { background: var(--color-bg); }
	.jt-opt.selected { background: #e6f0eb; }
	.jt-opt .jt-name { font-size: 13px; }
	.jt-opt .jt-dept { font-size: 11px; }
	.jt-empty { padding: 12px; text-align: center; font-size: 12px; color: #999; }
</style>
