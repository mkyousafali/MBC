<script lang="ts">
	import { onMount } from 'svelte';
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

	type JobTitle = { id: string; title_name: string; department_name: string };
	type Branch = { id: string; branch_name: string };
	type Employee = {
		user_id: string; employee_id: string; employee_code: string;
		full_name: string; username: string; whatsapp_number: string;
		email: string | null; job_title_id: string; job_title_name: string;
		salary_amount: number; salary_type: string; salary_day: string | null;
		joining_date: string; employment_status: string;
		branch_id: string | null; branch_name: string | null;
		is_active: boolean;
	};

	let activeView: 'list' | 'create' | 'edit' | 'detail' = $state('list');
	let loading = $state(false);
	let employees = $state<Employee[]>([]);
	let totalCount = $state(0);
	let searchQuery = $state('');
	let currentPage = $state(1);
	const pageSize = 20;

	let jobTitles = $state<JobTitle[]>([]);
	let branches = $state<Branch[]>([]);

	// Create form
	let createForm = $state({
		full_name: '', username: '', password: '', quick_access_code: '',
		is_active: true, whatsapp_number: '', email: '', job_title_id: '',
		salary_amount: 0, salary_type: 'monthly', salary_day: '',
		joining_date: '', id_type: 'Aadhaar', id_number: '',
		state: '', district: '', known_languages: '', branch_id: ''
	});
	let createLoading = $state(false);
	let usernameAvailable: boolean | null = $state(null);
	let usernameChecking = $state(false);

	// Edit state
	let editUserId = $state('');
	let editForm: any = $state(null);
	let editFormOriginalJson = '';
	let editLoading = $state(false);
	let selectedEmployee: Employee | null = $state(null);

	async function loadJobTitles() {
		const { data } = await supabase.rpc('rpc_get_active_job_titles');
		jobTitles = (data || []).map((j: any) => ({ id: j.id, title_name: j.title_name, department_name: j.department_name }));
	}

	async function loadBranches() {
		const { data } = await supabase.rpc('rpc_get_active_branches');
		branches = (data || []).map((b: any) => ({ id: b.id, branch_name: b.branch_name }));
	}

	async function loadEmployees(append = false) {
		if (!append) loading = true;
		const { data, error } = await supabase.rpc('rpc_list_employee_users', {
			p_search: searchQuery,
			p_status_filter: null,
			p_job_title_filter: null,
			p_sort_by: 'created_at',
			p_sort_dir: 'desc',
			p_limit: pageSize,
			p_offset: append ? employees.length : 0
		});
		loading = false;
		if (error) { toasts.add('Failed to load users', 'error'); return; }
		if (append) {
			employees = [...employees, ...(data?.data || [])];
		} else {
			employees = data?.data || [];
		}
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

	async function generateQAC() {
		const { data } = await supabase.rpc('rpc_generate_quick_access_code');
		if (data?.code) createForm.quick_access_code = data.code;
	}

	async function handleCreate() {
		if (!createForm.full_name.trim()) { toasts.add('Name is required', 'error'); return; }
		if (!createForm.username.trim()) { toasts.add('Username is required', 'error'); return; }
		if (createForm.password.length < 8) { toasts.add('Password must be 8+ characters', 'error'); return; }
		if (!/^\d{6}$/.test(createForm.quick_access_code)) { toasts.add('QAC must be 6 digits', 'error'); return; }
		if (!createForm.job_title_id) { toasts.add('Job title is required', 'error'); return; }
		if (!createForm.whatsapp_number.trim()) { toasts.add('WhatsApp number is required', 'error'); return; }
		if (!createForm.joining_date) { toasts.add('Joining date is required', 'error'); return; }
		if (!createForm.id_number.trim()) { toasts.add('ID number is required', 'error'); return; }
		if (!createForm.state.trim()) { toasts.add('State is required', 'error'); return; }
		if (!createForm.district.trim()) { toasts.add('District is required', 'error'); return; }

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

		toasts.add(`Employee ${data.employee_code} created!`, 'success');
		writeAuditLog({ action: 'create', resourceType: 'user', resourceId: data.user_id || '', resourceLabel: createForm.full_name.trim(), details: { employee_code: data.employee_code, username: createForm.username.trim() } });
		resetCreateForm();
		activeView = 'list';
		await loadEmployees();
	}

	function resetCreateForm() {
		createForm = { full_name: '', username: '', password: '', quick_access_code: '', is_active: true, whatsapp_number: '', email: '', job_title_id: '', salary_amount: 0, salary_type: 'monthly', salary_day: '', joining_date: '', id_type: 'Aadhaar', id_number: '', state: '', district: '', known_languages: '', branch_id: '' };
		usernameAvailable = null;
	}

	async function startEdit(emp: Employee) {
		selectedEmployee = emp;
		editUserId = emp.user_id;
		editLoading = true;
		const { data, error } = await supabase.rpc('rpc_get_employee_user', { p_user_id: emp.user_id });
		editLoading = false;
		if (error || !data?.success) { toasts.add('Failed to load details', 'error'); return; }
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
			branch_id: d.branch_id || '', password: '', quick_access_code: ''
		};
		editFormOriginalJson = JSON.stringify(editForm);
		activeView = 'edit';
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
			p_email: editForm.email || null,
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

		toasts.add('User updated!', 'success');
		const orig = JSON.parse(editFormOriginalJson);
		const changes = diffChanges(orig, editForm, ['full_name','username','is_active','whatsapp_number','email','job_title_id','salary_amount','salary_type','salary_day','joining_date','state','district','known_languages','employment_status','branch_id']);
		if (editForm.password) changes.push({ field: 'password', from: '***', to: '(changed)' });
		writeAuditLog({ action: 'update', resourceType: 'user', resourceId: editUserId, resourceLabel: editForm.full_name, changes });
		activeView = 'list';
		editForm = null;
		editFormOriginalJson = '';
		await loadEmployees();
	}

	async function toggleStatus(emp: Employee) {
		const newActive = emp.employment_status !== 'active';
		const newStatus = newActive ? 'active' : 'inactive';
		const { data, error } = await supabase.rpc('rpc_update_employee_user', {
			p_user_id: emp.user_id, p_is_active: newActive, p_employment_status: newStatus
		});
		if (error || !data?.success) { toasts.add('Failed to update', 'error'); return; }
		emp.employment_status = newStatus;
		emp.is_active = newActive;
		employees = [...employees];
		toasts.add(`${emp.full_name} is now ${newStatus}`, 'success');
		writeAuditLog({ action: 'status_change', resourceType: 'user', resourceId: emp.user_id, resourceLabel: emp.full_name, changes: [{ field: 'status', from: newActive ? 'inactive' : 'active', to: newStatus }] });
	}

	function doSearch() { currentPage = 1; loadEmployees(); }

	onMount(() => { loadJobTitles(); loadBranches(); loadEmployees(); });
</script>

<div class="users-mobile">
	<!-- LIST VIEW -->
	{#if activeView === 'list'}
		<div class="list-header">
			<h2>Users <span class="count">({totalCount})</span></h2>
			{#if permAdd}
				<button class="add-btn" onclick={() => { activeView = 'create'; resetCreateForm(); }}>+ Add</button>
			{/if}
		</div>

		<div class="search-bar">
			<input type="text" placeholder="Search name or code..." bind:value={searchQuery} onkeydown={(e) => e.key === 'Enter' && doSearch()}>
			<button class="search-go" onclick={doSearch}>🔍</button>
		</div>

		{#if loading}
			<div class="center-msg"><div class="spinner"></div></div>
		{:else if employees.length === 0}
			<div class="center-msg"><p>No users found.</p></div>
		{:else}
			<div class="user-list">
				{#each employees as emp}
					<div class="user-card">
						<div class="user-card-top">
							<div class="user-info">
								<span class="user-name">{emp.full_name}</span>
								<span class="user-code">{emp.employee_code} · {emp.job_title_name}</span>
								{#if emp.branch_name}
									<span class="user-branch">📍 {emp.branch_name}</span>
								{/if}
							</div>
							<span class="status-badge" class:active={emp.employment_status === 'active'} class:inactive={emp.employment_status !== 'active'}>
								{emp.employment_status}
							</span>
						</div>
						<div class="user-card-actions">
							{#if permEdit}
								<button class="action-sm edit" onclick={() => startEdit(emp)}>✏️ Edit</button>
								<button class="action-sm" class:deactivate={emp.is_active} class:activate={!emp.is_active} onclick={() => toggleStatus(emp)}>
									{emp.is_active ? '🔴 Deactivate' : '🟢 Activate'}
								</button>
							{/if}
						</div>
					</div>
				{/each}

				{#if employees.length < totalCount}
					<button class="load-more" onclick={() => loadEmployees(true)}>Load More ({totalCount - employees.length} remaining)</button>
				{/if}
			</div>
		{/if}

	<!-- CREATE VIEW -->
	{:else if activeView === 'create'}
		<div class="form-header">
			<button class="cancel-btn" onclick={() => { activeView = 'list'; }}>← Cancel</button>
			<h2>Create User</h2>
		</div>

		<div class="form-body">
			<div class="form-section">Personal Info</div>
			<label class="field">
				<span>Full Name *</span>
				<input type="text" bind:value={createForm.full_name}>
			</label>
			<label class="field">
				<span>WhatsApp Number *</span>
				<input type="tel" bind:value={createForm.whatsapp_number}>
			</label>
			<label class="field">
				<span>Email</span>
				<input type="email" bind:value={createForm.email}>
			</label>

			<div class="form-section">Login Credentials</div>
			<label class="field">
				<span>Username *</span>
				<input type="text" bind:value={createForm.username} oninput={onUsernameInput}>
				{#if usernameChecking}<span class="hint">Checking...</span>{/if}
				{#if usernameAvailable === true}<span class="hint ok">✓ Available</span>{/if}
				{#if usernameAvailable === false}<span class="hint err">✗ Taken</span>{/if}
			</label>
			<label class="field">
				<span>Password * (min 8)</span>
				<input type="password" bind:value={createForm.password}>
			</label>
			<label class="field">
				<span>Quick Access Code * (6 digits)</span>
				<div class="field-row">
					<input type="text" maxlength="6" bind:value={createForm.quick_access_code}>
					<button class="gen-btn" onclick={generateQAC}>Generate</button>
				</div>
			</label>

			<div class="form-section">Employment</div>
			<label class="field">
				<span>Job Title *</span>
				<select bind:value={createForm.job_title_id}>
					<option value="">Select...</option>
					{#each jobTitles as jt}<option value={jt.id}>{jt.title_name} ({jt.department_name})</option>{/each}
				</select>
			</label>
			<label class="field">
				<span>Branch</span>
				<select bind:value={createForm.branch_id}>
					<option value="">No branch</option>
					{#each branches as b}<option value={b.id}>{b.branch_name}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span>Joining Date *</span>
				<input type="date" bind:value={createForm.joining_date}>
			</label>
			<div class="field-row-2">
				<label class="field">
					<span>Salary Amount</span>
					<input type="number" bind:value={createForm.salary_amount}>
				</label>
				<label class="field">
					<span>Salary Type</span>
					<select bind:value={createForm.salary_type}>
						<option value="monthly">Monthly</option>
						<option value="weekly">Weekly</option>
						<option value="daily">Daily</option>
					</select>
				</label>
			</div>
			{#if createForm.salary_type === 'weekly'}
				<label class="field">
					<span>Salary Day</span>
					<select bind:value={createForm.salary_day}>
						{#each ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as d}<option value={d}>{d}</option>{/each}
					</select>
				</label>
			{/if}

			<div class="form-section">ID & Location</div>
			<div class="field-row-2">
				<label class="field">
					<span>ID Type</span>
					<select bind:value={createForm.id_type}>
						<option>Aadhaar</option><option>Passport</option><option>PAN</option><option>Voter ID</option><option>Other</option>
					</select>
				</label>
				<label class="field">
					<span>ID Number *</span>
					<input type="text" bind:value={createForm.id_number}>
				</label>
			</div>
			<div class="field-row-2">
				<label class="field">
					<span>State *</span>
					<input type="text" bind:value={createForm.state}>
				</label>
				<label class="field">
					<span>District *</span>
					<input type="text" bind:value={createForm.district}>
				</label>
			</div>
			<label class="field">
				<span>Known Languages (comma separated)</span>
				<input type="text" bind:value={createForm.known_languages} placeholder="Malayalam, English, Hindi">
			</label>

			<label class="field toggle-field">
				<span>Active</span>
				<input type="checkbox" bind:checked={createForm.is_active}>
			</label>

			<button class="submit-btn" onclick={handleCreate} disabled={createLoading}>
				{createLoading ? 'Creating...' : 'Create User'}
			</button>
		</div>

	<!-- EDIT VIEW -->
	{:else if activeView === 'edit' && editForm}
		<div class="form-header">
			<button class="cancel-btn" onclick={() => { activeView = 'list'; editForm = null; }}>← Cancel</button>
			<h2>Edit: {selectedEmployee?.full_name}</h2>
		</div>

		<div class="form-body">
			<div class="form-section">Personal Info</div>
			<label class="field">
				<span>Full Name</span>
				<input type="text" bind:value={editForm.full_name}>
			</label>
			<label class="field">
				<span>WhatsApp Number</span>
				<input type="tel" bind:value={editForm.whatsapp_number}>
			</label>
			<label class="field">
				<span>Email</span>
				<input type="email" bind:value={editForm.email}>
			</label>

			<div class="form-section">Login (leave blank to keep)</div>
			<label class="field">
				<span>New Password</span>
				<input type="password" bind:value={editForm.password} placeholder="Leave blank to keep">
			</label>
			<label class="field">
				<span>New Quick Access Code</span>
				<input type="text" maxlength="6" bind:value={editForm.quick_access_code} placeholder="Leave blank to keep">
			</label>

			<div class="form-section">Employment</div>
			<label class="field">
				<span>Job Title</span>
				<select bind:value={editForm.job_title_id}>
					<option value="">Select...</option>
					{#each jobTitles as jt}<option value={jt.id}>{jt.title_name} ({jt.department_name})</option>{/each}
				</select>
			</label>
			<label class="field">
				<span>Branch</span>
				<select bind:value={editForm.branch_id}>
					<option value="">No branch</option>
					{#each branches as b}<option value={b.id}>{b.branch_name}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span>Status</span>
				<select bind:value={editForm.employment_status}>
					<option value="active">Active</option>
					<option value="inactive">Inactive</option>
					<option value="terminated">Terminated</option>
				</select>
			</label>
			<label class="field">
				<span>Joining Date</span>
				<input type="date" bind:value={editForm.joining_date}>
			</label>
			<div class="field-row-2">
				<label class="field">
					<span>Salary</span>
					<input type="number" bind:value={editForm.salary_amount}>
				</label>
				<label class="field">
					<span>Salary Type</span>
					<select bind:value={editForm.salary_type}>
						<option value="monthly">Monthly</option>
						<option value="weekly">Weekly</option>
						<option value="daily">Daily</option>
					</select>
				</label>
			</div>

			<div class="form-section">ID & Location</div>
			<div class="field-row-2">
				<label class="field">
					<span>State</span>
					<input type="text" bind:value={editForm.state}>
				</label>
				<label class="field">
					<span>District</span>
					<input type="text" bind:value={editForm.district}>
				</label>
			</div>
			<label class="field">
				<span>Known Languages</span>
				<input type="text" bind:value={editForm.known_languages}>
			</label>

			<button class="submit-btn" onclick={handleUpdate} disabled={editLoading}>
				{editLoading ? 'Saving...' : 'Save Changes'}
			</button>
		</div>
	{/if}
</div>

<style>
	.users-mobile { padding: 16px; padding-bottom: 80px; }

	/* List */
	.list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
	.list-header h2 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0; }
	.count { font-weight: 400; color: #888; font-size: 14px; }
	.add-btn { background: #0E5A3C; color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }

	.search-bar { display: flex; gap: 8px; margin-bottom: 14px; }
	.search-bar input { flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; background: white; }
	.search-go { background: #0E5A3C; color: white; border: none; border-radius: 8px; padding: 10px 14px; cursor: pointer; font-size: 14px; }

	.center-msg { display: flex; justify-content: center; padding: 40px; color: #888; }

	.user-list { display: flex; flex-direction: column; gap: 10px; }

	.user-card { background: white; border-radius: 12px; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
	.user-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
	.user-info { display: flex; flex-direction: column; gap: 2px; }
	.user-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }
	.user-code { font-size: 12px; color: #888; }
	.user-branch { font-size: 12px; color: #666; margin-top: 2px; }

	.status-badge { font-size: 11px; padding: 3px 8px; border-radius: 6px; font-weight: 600; text-transform: capitalize; }
	.status-badge.active { background: #e6f7ee; color: #0E5A3C; }
	.status-badge.inactive { background: #ffe6e6; color: #d32f2f; }

	.user-card-actions { display: flex; gap: 8px; margin-top: 10px; border-top: 1px solid #f0f0f0; padding-top: 10px; }
	.action-sm { font-size: 12px; padding: 6px 12px; border-radius: 6px; border: 1px solid #ddd; background: white; cursor: pointer; font-weight: 500; }
	.action-sm.edit { color: #0E5A3C; border-color: #0E5A3C; }
	.action-sm.deactivate { color: #d32f2f; }
	.action-sm.activate { color: #0E5A3C; }

	.load-more { width: 100%; padding: 12px; border: 1px dashed #ccc; border-radius: 8px; background: white; color: #666; font-size: 13px; cursor: pointer; margin-top: 4px; }

	/* Forms */
	.form-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
	.form-header h2 { font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 0; }
	.cancel-btn { background: none; border: none; font-size: 14px; color: #0E5A3C; font-weight: 600; cursor: pointer; padding: 0; }

	.form-body { display: flex; flex-direction: column; gap: 12px; }
	.form-section { font-size: 12px; font-weight: 700; color: #0E5A3C; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 8px; padding-bottom: 4px; border-bottom: 1px solid #e8e8e8; }

	.field { display: flex; flex-direction: column; gap: 4px; }
	.field span { font-size: 12px; color: #555; font-weight: 500; }
	.field input, .field select { padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; background: white; }
	.field input:focus, .field select:focus { outline: none; border-color: #0E5A3C; }

	.field-row { display: flex; gap: 8px; }
	.field-row input { flex: 1; }
	.gen-btn { background: #C9A24D; color: white; border: none; border-radius: 8px; padding: 10px 14px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }

	.field-row-2 { display: flex; gap: 10px; }
	.field-row-2 .field { flex: 1; }

	.toggle-field { flex-direction: row; align-items: center; justify-content: space-between; }
	.toggle-field input[type="checkbox"] { width: 20px; height: 20px; }

	.hint { font-size: 11px; }
	.hint.ok { color: #0E5A3C; }
	.hint.err { color: #d32f2f; }

	.submit-btn { width: 100%; padding: 14px; border: none; border-radius: 10px; background: #0E5A3C; color: white; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 12px; }
	.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.submit-btn:active:not(:disabled) { background: #094a30; }

	.spinner { width: 28px; height: 28px; border: 3px solid #e0e0e0; border-top-color: #0E5A3C; border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
