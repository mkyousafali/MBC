<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog } from '$lib/utils/audit';

	// Permission system
	const RESOURCE_KEY = 'hr.operations.employee_shifts';
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

	// Tab state
	let activeTab: 'regular' | 'special_weekday' | 'special_date' = $state('regular');

	// ===== COMMON =====
	type SubShift = { id: string; start_time: string; end_time: string; is_next_day: boolean; total_hours: number; };
	type ShiftEntry = { start_time: string; end_time: string; is_next_day: boolean; total_hours: number; };

	const hours12 = ['12','01','02','03','04','05','06','07','08','09','10','11'];
	const minutes = ['00','15','30','45'];
	const weekdays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

	function todayStr(): string {
		return new Date().toISOString().split('T')[0];
	}

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function capitalizeDay(d: string): string { return d.charAt(0).toUpperCase() + d.slice(1); }

	function calcEntryHours(sH: string, sM: string, sAP: string, eH: string, eM: string, eAP: string, nextDay: boolean): number {
		let startH = parseInt(sH) % 12 + (sAP === 'PM' ? 12 : 0);
		let endH = parseInt(eH) % 12 + (eAP === 'PM' ? 12 : 0);
		let startTotal = startH * 60 + parseInt(sM);
		let endTotal = endH * 60 + parseInt(eM);
		if (nextDay) endTotal += 24 * 60;
		else if (endTotal <= startTotal) endTotal += 24 * 60;
		return Math.round((endTotal - startTotal) / 60 * 100) / 100;
	}

	// ===== REGULAR TAB =====
	type EmpShift = {
		user_id: string;
		employee_code: string;
		full_name: string;
		whatsapp_number: string;
		shifts: SubShift[] | null;
		shift_group_id: string | null;
		start_buffer_hours: number;
		end_buffer_hours: number;
		total_hours: number;
		shift_start_date: string | null;
	};

	let loading = $state(false);
	let employees: EmpShift[] = $state([]);
	let regularSearch = $state('');
	const filteredEmployees = $derived(
		regularSearch.trim() ? employees.filter(e => e.full_name.toLowerCase().includes(regularSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(regularSearch.toLowerCase())) : employees
	);

	// Modal state
	let modalOpen = $state(false);
	let modalMode: 'add' | 'change' = $state('add');
	let modalUserId = $state('');
	let modalUserName = $state('');
	let saving = $state(false);

	// Multi-shift toggle
	let isMultiShift = $state(false);
	let shiftEntries: ShiftEntry[] = $state([]);

	// Form fields
	let formStartHour = $state('09');
	let formStartMin = $state('00');
	let formStartAmPm: 'AM' | 'PM' = $state('AM');
	let formEndHour = $state('05');
	let formEndMin = $state('00');
	let formEndAmPm: 'AM' | 'PM' = $state('PM');
	let formStartBuffer = $state(3);
	let formEndBuffer = $state(3);
	let formNextDay = $state(false);
	let formStartDate = $state(todayStr());
	let formChangeDate = $state('');

	let currentEntryHours = $derived(calcEntryHours(formStartHour, formStartMin, formStartAmPm, formEndHour, formEndMin, formEndAmPm, formNextDay));
	let grandTotalHours = $derived(
		isMultiShift ? shiftEntries.reduce((sum, e) => sum + e.total_hours, 0) : currentEntryHours
	);

	function addShiftEntry() {
		const startTime = `${formStartHour}:${formStartMin} ${formStartAmPm}`;
		const endTime = `${formEndHour}:${formEndMin} ${formEndAmPm}`;
		shiftEntries = [...shiftEntries, { start_time: startTime, end_time: endTime, is_next_day: formNextDay, total_hours: currentEntryHours }];
		formStartHour = '09'; formStartMin = '00'; formStartAmPm = 'AM';
		formEndHour = '05'; formEndMin = '00'; formEndAmPm = 'PM';
		formNextDay = false;
	}

	function removeShiftEntry(idx: number) {
		shiftEntries = shiftEntries.filter((_, i) => i !== idx);
	}

	async function loadEmployees() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_list_employee_shifts');
		loading = false;
		if (error) { toasts.add('Failed to load: ' + error.message, 'error'); return; }
		employees = data?.data || [];
	}

	function openAdd(emp: EmpShift) {
		modalMode = 'add';
		modalUserId = emp.user_id;
		modalUserName = emp.full_name;
		isMultiShift = false;
		shiftEntries = [];
		formStartHour = '09'; formStartMin = '00'; formStartAmPm = 'AM';
		formEndHour = '05'; formEndMin = '00'; formEndAmPm = 'PM';
		formStartBuffer = 3; formEndBuffer = 3;
		formNextDay = false;
		formStartDate = todayStr();
		endShiftMode = false;
		modalOpen = true;
	}

	function openChange(emp: EmpShift) {
		modalMode = 'change';
		modalUserId = emp.user_id;
		modalUserName = emp.full_name;
		endShiftMode = false;
		formChangeDate = '';

		if (emp.shifts && emp.shifts.length > 1) {
			isMultiShift = true;
			shiftEntries = emp.shifts.map(s => ({ start_time: s.start_time, end_time: s.end_time, is_next_day: s.is_next_day, total_hours: s.total_hours }));
			formStartHour = '09'; formStartMin = '00'; formStartAmPm = 'AM';
			formEndHour = '05'; formEndMin = '00'; formEndAmPm = 'PM';
			formNextDay = false;
		} else if (emp.shifts && emp.shifts.length === 1) {
			isMultiShift = false;
			shiftEntries = [];
			const s = emp.shifts[0];
			const [t1, ap1] = s.start_time.split(' ');
			const [h1, m1] = t1.split(':');
			formStartHour = h1; formStartMin = m1; formStartAmPm = ap1 as 'AM' | 'PM';
			const [t2, ap2] = s.end_time.split(' ');
			const [h2, m2] = t2.split(':');
			formEndHour = h2; formEndMin = m2; formEndAmPm = ap2 as 'AM' | 'PM';
			formNextDay = s.is_next_day;
		} else {
			isMultiShift = false;
			shiftEntries = [];
			formStartHour = '09'; formStartMin = '00'; formStartAmPm = 'AM';
			formEndHour = '05'; formEndMin = '00'; formEndAmPm = 'PM';
			formNextDay = false;
		}

		formStartBuffer = emp.start_buffer_hours || 3;
		formEndBuffer = emp.end_buffer_hours || 3;
		modalOpen = true;
	}

	async function handleSave() {
		let shiftsPayload: ShiftEntry[];
		if (isMultiShift) {
			if (shiftEntries.length === 0) { toasts.add('Please add at least one shift', 'error'); return; }
			shiftsPayload = shiftEntries;
		} else {
			const startTime = `${formStartHour}:${formStartMin} ${formStartAmPm}`;
			const endTime = `${formEndHour}:${formEndMin} ${formEndAmPm}`;
			shiftsPayload = [{ start_time: startTime, end_time: endTime, is_next_day: formNextDay, total_hours: currentEntryHours }];
		}

		saving = true;
		if (modalMode === 'add') {
			const { data, error } = await supabase.rpc('rpc_add_regular_shift_multi', {
				p_user_id: modalUserId,
				p_shifts: shiftsPayload,
				p_start_buffer_hours: formStartBuffer,
				p_end_buffer_hours: formEndBuffer,
				p_total_hours: grandTotalHours,
				p_shift_start_date: formStartDate
			});
			saving = false;
			if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
			if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
			toasts.add(`Shift added for ${modalUserName}`, 'success');
			writeAuditLog({
				action: 'create',
				resourceType: 'regular_shift',
				resourceId: data.shift_group_id || '',
				resourceLabel: modalUserName,
				details: { shifts: shiftsPayload, total_hours: grandTotalHours, start_date: formStartDate }
			});
		} else {
			if (!formChangeDate) { toasts.add('Please select a start date for the new shift', 'error'); saving = false; return; }
			const { data, error } = await supabase.rpc('rpc_change_regular_shift_multi', {
				p_user_id: modalUserId,
				p_new_start_date: formChangeDate,
				p_shifts: shiftsPayload,
				p_start_buffer_hours: formStartBuffer,
				p_end_buffer_hours: formEndBuffer,
				p_total_hours: grandTotalHours
			});
			saving = false;
			if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
			if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
			toasts.add(`Shift changed for ${modalUserName}`, 'success');
			writeAuditLog({
				action: 'update',
				resourceType: 'regular_shift',
				resourceId: data.shift_group_id || '',
				resourceLabel: modalUserName,
				details: { shifts: shiftsPayload, total_hours: grandTotalHours, new_start_date: formChangeDate }
			});
		}
		modalOpen = false;
		await loadEmployees();
	}

	// End Regular Shift
	let endShiftMode = $state(false);
	let endShiftDate = $state('');
	let endShiftSaving = $state(false);

	function startEndShift() {
		endShiftMode = true;
		endShiftDate = todayStr();
	}

	async function handleEndRegularShift() {
		if (!endShiftDate) { toasts.add('Please select an end date', 'error'); return; }
		endShiftSaving = true;
		const { data, error } = await supabase.rpc('rpc_end_regular_shift', {
			p_user_id: modalUserId,
			p_end_date: endShiftDate
		});
		endShiftSaving = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
		toasts.add(`Shift ended for ${modalUserName}`, 'success');
		writeAuditLog({
			action: 'status_change',
			resourceType: 'regular_shift',
			resourceId: modalUserId,
			resourceLabel: modalUserName,
			changes: [{ field: 'status', from: 'active', to: 'ended' }],
			details: { end_date: endShiftDate }
		});
		modalOpen = false;
		endShiftMode = false;
		await loadEmployees();
	}

	$effect(() => { if (activeTab === 'regular') loadEmployees(); });
	$effect(() => { if (activeTab === 'special_weekday') loadWeekdayShifts(); });
	$effect(() => { if (activeTab === 'special_date') loadDateShifts(); });

	// ===== WEEKDAY SHIFTS =====
	type WdSubShift = { id: string; start_time: string; end_time: string; is_next_day: boolean; total_hours: number; start_buffer_hours: number; end_buffer_hours: number; };
	type WeekdayShiftGroup = { weekday: string; shift_group_id: string; shifts: WdSubShift[]; total_hours: number; shift_start_date: string; };
	type EmpWeekday = { user_id: string; employee_code: string; full_name: string; whatsapp_number: string; weekday_shifts: WeekdayShiftGroup[] | null; };

	let wdLoading = $state(false);
	let wdEmployees: EmpWeekday[] = $state([]);
	let wdSearch = $state('');
	const filteredWdEmployees = $derived(
		wdSearch.trim() ? wdEmployees.filter(e => e.full_name.toLowerCase().includes(wdSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(wdSearch.toLowerCase())) : wdEmployees
	);
	let wdModalOpen = $state(false);
	let wdModalMode: 'add' | 'change' = $state('add');
	let wdUserId = $state('');
	let wdUserName = $state('');
	let wdWeekday = $state('monday');
	let wdSaving = $state(false);

	let wdIsMulti = $state(false);
	let wdShiftEntries: ShiftEntry[] = $state([]);

	let wdStartHour = $state('09');
	let wdStartMin = $state('00');
	let wdStartAmPm: 'AM' | 'PM' = $state('AM');
	let wdEndHour = $state('05');
	let wdEndMin = $state('00');
	let wdEndAmPm: 'AM' | 'PM' = $state('PM');
	let wdStartBuffer = $state(3);
	let wdEndBuffer = $state(3);
	let wdNextDay = $state(false);
	let wdStartDate = $state(todayStr());
	let wdChangeDate = $state('');

	let wdCurrentEntryHours = $derived(calcEntryHours(wdStartHour, wdStartMin, wdStartAmPm, wdEndHour, wdEndMin, wdEndAmPm, wdNextDay));
	let wdGrandTotal = $derived(
		wdIsMulti ? wdShiftEntries.reduce((sum, e) => sum + e.total_hours, 0) : wdCurrentEntryHours
	);

	function addWdEntry() {
		const startTime = `${wdStartHour}:${wdStartMin} ${wdStartAmPm}`;
		const endTime = `${wdEndHour}:${wdEndMin} ${wdEndAmPm}`;
		wdShiftEntries = [...wdShiftEntries, { start_time: startTime, end_time: endTime, is_next_day: wdNextDay, total_hours: wdCurrentEntryHours }];
		wdStartHour = '09'; wdStartMin = '00'; wdStartAmPm = 'AM';
		wdEndHour = '05'; wdEndMin = '00'; wdEndAmPm = 'PM';
		wdNextDay = false;
	}

	function removeWdEntry(idx: number) {
		wdShiftEntries = wdShiftEntries.filter((_, i) => i !== idx);
	}

	async function loadWeekdayShifts() {
		wdLoading = true;
		const { data, error } = await supabase.rpc('rpc_list_employee_weekday_shifts');
		wdLoading = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		wdEmployees = data?.data || [];
	}

	function openWdAdd(emp: EmpWeekday) {
		wdModalMode = 'add';
		wdUserId = emp.user_id;
		wdUserName = emp.full_name;
		wdWeekday = 'monday';
		wdIsMulti = false;
		wdShiftEntries = [];
		wdStartHour = '09'; wdStartMin = '00'; wdStartAmPm = 'AM';
		wdEndHour = '05'; wdEndMin = '00'; wdEndAmPm = 'PM';
		wdStartBuffer = 3; wdEndBuffer = 3; wdNextDay = false;
		wdStartDate = todayStr();
		wdEndShiftMode = false;
		wdModalOpen = true;
	}

	function openWdChange(emp: EmpWeekday, shiftGroup: WeekdayShiftGroup) {
		wdModalMode = 'change';
		wdUserId = emp.user_id;
		wdUserName = emp.full_name;
		wdWeekday = shiftGroup.weekday;
		wdChangeDate = '';
		wdEndShiftMode = false;

		if (shiftGroup.shifts.length > 1) {
			wdIsMulti = true;
			wdShiftEntries = shiftGroup.shifts.map(s => ({ start_time: s.start_time, end_time: s.end_time, is_next_day: s.is_next_day, total_hours: s.total_hours }));
			wdStartHour = '09'; wdStartMin = '00'; wdStartAmPm = 'AM';
			wdEndHour = '05'; wdEndMin = '00'; wdEndAmPm = 'PM';
			wdNextDay = false;
		} else if (shiftGroup.shifts.length === 1) {
			wdIsMulti = false;
			wdShiftEntries = [];
			const s = shiftGroup.shifts[0];
			const [t1, ap1] = s.start_time.split(' ');
			const [h1, m1] = t1.split(':');
			wdStartHour = h1; wdStartMin = m1; wdStartAmPm = ap1 as 'AM' | 'PM';
			const [t2, ap2] = s.end_time.split(' ');
			const [h2, m2] = t2.split(':');
			wdEndHour = h2; wdEndMin = m2; wdEndAmPm = ap2 as 'AM' | 'PM';
			wdNextDay = s.is_next_day;
		}

		wdStartBuffer = shiftGroup.shifts[0]?.start_buffer_hours || 3;
		wdEndBuffer = shiftGroup.shifts[0]?.end_buffer_hours || 3;
		wdModalOpen = true;
	}

	async function handleWdSave() {
		let shiftsPayload: ShiftEntry[];
		if (wdIsMulti) {
			if (wdShiftEntries.length === 0) { toasts.add('Please add at least one shift', 'error'); return; }
			shiftsPayload = wdShiftEntries;
		} else {
			const startTime = `${wdStartHour}:${wdStartMin} ${wdStartAmPm}`;
			const endTime = `${wdEndHour}:${wdEndMin} ${wdEndAmPm}`;
			shiftsPayload = [{ start_time: startTime, end_time: endTime, is_next_day: wdNextDay, total_hours: wdCurrentEntryHours }];
		}

		wdSaving = true;
		if (wdModalMode === 'add') {
			const { data, error } = await supabase.rpc('rpc_add_weekday_shift_multi', {
				p_user_id: wdUserId,
				p_weekday: wdWeekday,
				p_shifts: shiftsPayload,
				p_start_buffer_hours: wdStartBuffer,
				p_end_buffer_hours: wdEndBuffer,
				p_total_hours: wdGrandTotal,
				p_shift_start_date: wdStartDate
			});
			wdSaving = false;
			if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
			if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
			toasts.add(`${wdWeekday} shift added for ${wdUserName}`, 'success');
			writeAuditLog({
				action: 'create',
				resourceType: 'weekday_shift',
				resourceId: data.shift_group_id || '',
				resourceLabel: `${wdUserName} — ${wdWeekday}`,
				details: { weekday: wdWeekday, shifts: shiftsPayload, total_hours: wdGrandTotal }
			});
		} else {
			if (!wdChangeDate) { toasts.add('Please select a start date', 'error'); wdSaving = false; return; }
			const { data, error } = await supabase.rpc('rpc_change_weekday_shift_multi', {
				p_user_id: wdUserId,
				p_weekday: wdWeekday,
				p_new_start_date: wdChangeDate,
				p_shifts: shiftsPayload,
				p_start_buffer_hours: wdStartBuffer,
				p_end_buffer_hours: wdEndBuffer,
				p_total_hours: wdGrandTotal
			});
			wdSaving = false;
			if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
			if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
			toasts.add(`${wdWeekday} shift changed for ${wdUserName}`, 'success');
			writeAuditLog({
				action: 'update',
				resourceType: 'weekday_shift',
				resourceId: data.shift_group_id || '',
				resourceLabel: `${wdUserName} — ${wdWeekday}`,
				details: { weekday: wdWeekday, shifts: shiftsPayload, total_hours: wdGrandTotal, new_start_date: wdChangeDate }
			});
		}
		wdModalOpen = false;
		await loadWeekdayShifts();
	}

	// End Weekday Shift
	let wdEndShiftMode = $state(false);
	let wdEndShiftDate = $state('');
	let wdEndShiftSaving = $state(false);

	function startWdEndShift() {
		wdEndShiftMode = true;
		wdEndShiftDate = todayStr();
	}

	async function handleEndWeekdayShift() {
		if (!wdEndShiftDate) { toasts.add('Please select an end date', 'error'); return; }
		wdEndShiftSaving = true;
		const { data, error } = await supabase.rpc('rpc_end_weekday_shift', {
			p_user_id: wdUserId,
			p_weekday: wdWeekday,
			p_end_date: wdEndShiftDate
		});
		wdEndShiftSaving = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
		toasts.add(`${wdWeekday} shift ended for ${wdUserName}`, 'success');
		writeAuditLog({
			action: 'status_change',
			resourceType: 'weekday_shift',
			resourceId: wdUserId,
			resourceLabel: `${wdUserName} — ${wdWeekday}`,
			changes: [{ field: 'status', from: 'active', to: 'ended' }],
			details: { weekday: wdWeekday, end_date: wdEndShiftDate }
		});
		wdModalOpen = false;
		wdEndShiftMode = false;
		await loadWeekdayShifts();
	}

	// ===== SPECIAL DATE SHIFTS =====
	type DateShift = {
		id: string; user_id: string; employee_code: string; full_name: string;
		start_date: string; end_date: string; total_days: number;
		total_hours: number; created_at: string;
		shifts: SubShift[];
	};

	let sdLoading = $state(false);
	let sdShifts: DateShift[] = $state([]);
	let sdSearch = $state('');
	const filteredSdShifts = $derived(
		sdSearch.trim() ? sdShifts.filter(s => s.full_name.toLowerCase().includes(sdSearch.toLowerCase()) || s.employee_code.toLowerCase().includes(sdSearch.toLowerCase())) : sdShifts
	);

	let sdModalOpen = $state(false);
	let sdSaving = $state(false);
	let sdUserId = $state('');
	let sdUserName = $state('');
	let sdStartDate = $state(todayStr());
	let sdEndDate = $state(todayStr());
	let sdStartHour = $state('09');
	let sdStartMin = $state('00');
	let sdStartAmPm: 'AM' | 'PM' = $state('AM');
	let sdEndHour = $state('05');
	let sdEndMin = $state('00');
	let sdEndAmPm: 'AM' | 'PM' = $state('PM');
	let sdStartBuffer = $state(3);
	let sdEndBuffer = $state(3);
	let sdNextDay = $state(false);

	let sdIsMulti = $state(false);
	let sdShiftEntries: ShiftEntry[] = $state([]);

	let sdEmployees: {user_id: string; employee_code: string; full_name: string}[] = $state([]);
	let sdEmpSearch = $state('');
	let sdEmpDropdownOpen = $state(false);
	const filteredSdEmps = $derived(
		sdEmpSearch.trim() ? sdEmployees.filter(e => e.full_name.toLowerCase().includes(sdEmpSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(sdEmpSearch.toLowerCase())) : sdEmployees
	);

	let sdCurrentEntryHours = $derived(calcEntryHours(sdStartHour, sdStartMin, sdStartAmPm, sdEndHour, sdEndMin, sdEndAmPm, sdNextDay));
	let sdGrandTotal = $derived(
		sdIsMulti ? sdShiftEntries.reduce((sum, e) => sum + e.total_hours, 0) : sdCurrentEntryHours
	);
	let sdTotalDays = $derived(calcSdDays());

	function calcSdDays(): number {
		if (!sdStartDate || !sdEndDate) return 0;
		const s = new Date(sdStartDate); const e = new Date(sdEndDate);
		const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		return diff > 0 ? diff : 0;
	}

	function addSdEntry() {
		const startTime = `${sdStartHour}:${sdStartMin} ${sdStartAmPm}`;
		const endTime = `${sdEndHour}:${sdEndMin} ${sdEndAmPm}`;
		sdShiftEntries = [...sdShiftEntries, { start_time: startTime, end_time: endTime, is_next_day: sdNextDay, total_hours: sdCurrentEntryHours }];
		sdStartHour = '09'; sdStartMin = '00'; sdStartAmPm = 'AM';
		sdEndHour = '05'; sdEndMin = '00'; sdEndAmPm = 'PM';
		sdNextDay = false;
	}

	function removeSdEntry(idx: number) {
		sdShiftEntries = sdShiftEntries.filter((_, i) => i !== idx);
	}

	async function loadDateShifts() {
		sdLoading = true;
		const { data, error } = await supabase.rpc('rpc_list_special_date_shifts');
		sdLoading = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		sdShifts = data?.data || [];
	}

	async function loadSdEmployees() {
		const { data } = await supabase.rpc('rpc_list_employee_users', {
			p_search: '', p_status_filter: 'active', p_job_title_filter: null,
			p_branch_filter: null, p_sort_by: 'full_name', p_sort_dir: 'asc',
			p_limit: 200, p_offset: 0
		});
		sdEmployees = (data?.data || []).map((e: any) => ({ user_id: e.user_id, employee_code: e.employee_code, full_name: e.full_name }));
	}

	function openSdAdd() {
		sdUserId = ''; sdUserName = ''; sdEmpSearch = '';
		sdStartDate = todayStr(); sdEndDate = todayStr();
		sdStartHour = '09'; sdStartMin = '00'; sdStartAmPm = 'AM';
		sdEndHour = '05'; sdEndMin = '00'; sdEndAmPm = 'PM';
		sdStartBuffer = 3; sdEndBuffer = 3; sdNextDay = false;
		sdIsMulti = false; sdShiftEntries = [];
		sdEmpDropdownOpen = false;
		loadSdEmployees();
		sdModalOpen = true;
	}

	function selectSdEmp(emp: {user_id: string; employee_code: string; full_name: string}) {
		sdUserId = emp.user_id;
		sdUserName = emp.full_name;
		sdEmpSearch = `${emp.employee_code} — ${emp.full_name}`;
		sdEmpDropdownOpen = false;
	}

	async function handleSdSave() {
		if (!sdUserId) { toasts.add('Please select an employee', 'error'); return; }
		if (!sdStartDate || !sdEndDate) { toasts.add('Please select start and end dates', 'error'); return; }
		if (sdTotalDays <= 0) { toasts.add('End date must be on or after start date', 'error'); return; }

		let shiftsPayload: ShiftEntry[];
		if (sdIsMulti) {
			if (sdShiftEntries.length === 0) { toasts.add('Please add at least one shift', 'error'); return; }
			shiftsPayload = sdShiftEntries;
		} else {
			const startTime = `${sdStartHour}:${sdStartMin} ${sdStartAmPm}`;
			const endTime = `${sdEndHour}:${sdEndMin} ${sdEndAmPm}`;
			shiftsPayload = [{ start_time: startTime, end_time: endTime, is_next_day: sdNextDay, total_hours: sdCurrentEntryHours }];
		}

		sdSaving = true;
		const { data, error } = await supabase.rpc('rpc_add_special_date_shift_multi', {
			p_user_id: sdUserId,
			p_start_date: sdStartDate,
			p_end_date: sdEndDate,
			p_shifts: shiftsPayload,
			p_start_buffer_hours: sdStartBuffer,
			p_end_buffer_hours: sdEndBuffer,
			p_total_hours: sdGrandTotal
		});
		sdSaving = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
		toasts.add(`Special date shift added for ${sdUserName} (${data.total_days} day${data.total_days > 1 ? 's' : ''})`, 'success');
		writeAuditLog({
			action: 'create',
			resourceType: 'date_shift',
			resourceId: data.shift_group_id || '',
			resourceLabel: sdUserName,
			details: { start_date: sdStartDate, end_date: sdEndDate, total_days: data.total_days, shifts: shiftsPayload, total_hours: sdGrandTotal }
		});
		sdModalOpen = false;
		await loadDateShifts();
	}

	async function deleteSdShift(shiftId: string, name: string) {
		if (!confirm(`Delete special date shift for ${name}?`)) return;
		const { data, error } = await supabase.rpc('rpc_delete_special_date_shift', { p_shift_id: shiftId });
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		toasts.add('Shift deleted', 'success');
		writeAuditLog({
			action: 'delete',
			resourceType: 'date_shift',
			resourceId: shiftId,
			resourceLabel: name
		});
		await loadDateShifts();
	}
</script>

<div class="page">
	<!-- Tabs -->
	<div class="tab-bar">
		<button class="tab" class:active={activeTab === 'regular'} onclick={() => activeTab = 'regular'}>
			Regular
		</button>
		<button class="tab" class:active={activeTab === 'special_weekday'} onclick={() => activeTab = 'special_weekday'}>
			Weekday
		</button>
		<button class="tab" class:active={activeTab === 'special_date'} onclick={() => activeTab = 'special_date'}>
			Date
		</button>
	</div>

	<!-- Search Bar -->
	<div class="search-bar">
		{#if activeTab === 'regular'}
			<input type="text" placeholder="Search by name or code..." bind:value={regularSearch} />
		{:else if activeTab === 'special_weekday'}
			<input type="text" placeholder="Search by name or code..." bind:value={wdSearch} />
		{:else}
			<div class="search-row">
				<input type="text" placeholder="Search by name or code..." bind:value={sdSearch} />
				{#if permAdd}
					<button class="fab-inline" onclick={openSdAdd}>+</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Content -->
	<div class="content">
		<!-- ===== REGULAR TAB ===== -->
		{#if activeTab === 'regular'}
			{#if loading}
				<div class="empty-state"><div class="spinner"></div><p>Loading...</p></div>
			{:else if filteredEmployees.length === 0}
				<div class="empty-state">
					<div class="empty-icon">🕐</div>
					<p>{regularSearch.trim() ? 'No matching employees' : 'No active employees found'}</p>
				</div>
			{:else}
				<div class="card-list">
					{#each filteredEmployees as emp, i}
						<div class="emp-card">
							<div class="card-top">
								<div class="emp-info">
									<span class="emp-code">{emp.employee_code}</span>
									<span class="emp-name">{emp.full_name}</span>
								</div>
								<div class="card-action">
									{#if emp.shifts && emp.shifts.length > 0}
										{#if permEdit}
											<button class="action-btn change" onclick={() => openChange(emp)}>Change</button>
										{/if}
									{:else}
										{#if permAdd}
											<button class="action-btn add" onclick={() => openAdd(emp)}>Add</button>
										{/if}
									{/if}
								</div>
							</div>
							{#if emp.shifts && emp.shifts.length > 0}
								<div class="card-shifts">
									{#each emp.shifts as s, si}
										<div class="shift-pill">
											<span class="pill-time">{s.start_time} – {s.end_time}</span>
											{#if s.is_next_day}<span class="next-day">+1</span>{/if}
										</div>
									{/each}
								</div>
								<div class="card-meta">
									<span class="meta-item"><strong>{emp.total_hours}h</strong> total</span>
									<span class="meta-item">Since {formatDate(emp.shift_start_date)}</span>
								</div>
							{:else}
								<div class="no-shift-label">No shift assigned</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

		<!-- ===== WEEKDAY TAB ===== -->
		{:else if activeTab === 'special_weekday'}
			{#if wdLoading}
				<div class="empty-state"><div class="spinner"></div><p>Loading...</p></div>
			{:else if filteredWdEmployees.length === 0}
				<div class="empty-state">
					<div class="empty-icon">📅</div>
					<p>{wdSearch.trim() ? 'No matching employees' : 'No active employees found'}</p>
				</div>
			{:else}
				<div class="card-list">
					{#each filteredWdEmployees as emp, i}
						<div class="emp-card">
							<div class="card-top">
								<div class="emp-info">
									<span class="emp-code">{emp.employee_code}</span>
									<span class="emp-name">{emp.full_name}</span>
								</div>
								{#if permAdd}
									<button class="action-btn add" onclick={() => openWdAdd(emp)}>+ Day</button>
								{/if}
							</div>
							{#if emp.weekday_shifts && emp.weekday_shifts.length > 0}
								<div class="weekday-grid">
									{#each weekdays as day}
										{@const sg = emp.weekday_shifts?.find(s => s.weekday === day)}
										<button
											class="day-cell"
											class:has-shift={!!sg}
											onclick={() => sg && openWdChange(emp, sg)}
											disabled={!sg}
										>
											<span class="day-abbr">{day.slice(0, 3).toUpperCase()}</span>
											{#if sg}
												<span class="day-hrs">{sg.total_hours}h</span>
											{:else}
												<span class="day-dash">—</span>
											{/if}
										</button>
									{/each}
								</div>
							{:else}
								<div class="no-shift-label">No weekday shifts assigned</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

		<!-- ===== SPECIAL DATE TAB ===== -->
		{:else if activeTab === 'special_date'}
			{#if sdLoading}
				<div class="empty-state"><div class="spinner"></div><p>Loading...</p></div>
			{:else if filteredSdShifts.length === 0}
				<div class="empty-state">
					<div class="empty-icon">📌</div>
					<h3>No Special Date Shifts</h3>
					<p>{sdSearch.trim() ? 'No matching shifts' : 'Tap + to create one'}</p>
				</div>
			{:else}
				<div class="card-list">
					{#each filteredSdShifts as shift, i}
						<div class="emp-card">
							<div class="card-top">
								<div class="emp-info">
									<span class="emp-code">{shift.employee_code}</span>
									<span class="emp-name">{shift.full_name}</span>
								</div>
								{#if permDelete}
									<button class="action-btn delete" onclick={() => deleteSdShift(shift.id, shift.full_name)}>Delete</button>
								{/if}
							</div>
							<div class="card-shifts">
								{#each shift.shifts as s, si}
									<div class="shift-pill">
										<span class="pill-time">{s.start_time} – {s.end_time}</span>
										{#if s.is_next_day}<span class="next-day">+1</span>{/if}
									</div>
								{/each}
							</div>
							<div class="card-meta">
								<span class="meta-item">{formatDate(shift.start_date)} → {formatDate(shift.end_date)}</span>
								<span class="meta-item"><strong>{shift.total_days}d</strong></span>
								<span class="meta-item"><strong>{shift.total_hours}h</strong>/day</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- ==================== REGULAR SHIFT BOTTOM SHEET ==================== -->
{#if modalOpen}
	<div class="sheet-overlay" onclick={() => modalOpen = false}>
		<div class="bottom-sheet" onclick={(e) => e.stopPropagation()}>
			<div class="sheet-handle"></div>
			<div class="sheet-header">
				<h3>{modalMode === 'add' ? 'Add Shift' : 'Change Shift'}</h3>
				<span class="sheet-subtitle">{modalUserName}</span>
			</div>

			<div class="sheet-body">
				{#if endShiftMode}
					<div class="form-group">
						<label>End Date</label>
						<input type="date" bind:value={endShiftDate} />
						<span class="hint">Shift will be marked inactive from this date.</span>
					</div>
					<div class="sheet-actions">
						<button class="btn secondary" onclick={() => endShiftMode = false}>Back</button>
						<button class="btn danger" onclick={handleEndRegularShift} disabled={endShiftSaving || !endShiftDate}>
							{endShiftSaving ? 'Ending...' : 'Confirm End'}
						</button>
					</div>
				{:else}
					<!-- Shift Type Toggle -->
					<div class="toggle-row">
						<button class="toggle-opt" class:active={!isMultiShift} onclick={() => { isMultiShift = false; shiftEntries = []; }}>Single</button>
						<button class="toggle-opt" class:active={isMultiShift} onclick={() => { isMultiShift = true; }}>Multiple</button>
					</div>

					<!-- Existing multi entries -->
					{#if isMultiShift && shiftEntries.length > 0}
						<div class="entries-box">
							<div class="entries-title">Added Shifts</div>
							{#each shiftEntries as entry, idx}
								<div class="entry-item">
									<span class="entry-num">{idx + 1}.</span>
									<span class="entry-time">{entry.start_time} – {entry.end_time}{#if entry.is_next_day} <span class="next-day">+1</span>{/if}</span>
									<span class="entry-hrs">{entry.total_hours}h</span>
									<button class="entry-del" onclick={() => removeShiftEntry(idx)}>✕</button>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Time Pickers -->
					<div class="form-group">
						<label>{isMultiShift ? 'New Shift — Start' : 'Start Time'}</label>
						<div class="time-picker">
							<select bind:value={formStartHour}>{#each hours12 as h}<option value={h}>{h}</option>{/each}</select>
							<span class="colon">:</span>
							<select bind:value={formStartMin}>{#each minutes as m}<option value={m}>{m}</option>{/each}</select>
							<select bind:value={formStartAmPm}><option value="AM">AM</option><option value="PM">PM</option></select>
						</div>
					</div>
					<div class="form-group">
						<label>{isMultiShift ? 'New Shift — End' : 'End Time'}</label>
						<div class="time-picker">
							<select bind:value={formEndHour}>{#each hours12 as h}<option value={h}>{h}</option>{/each}</select>
							<span class="colon">:</span>
							<select bind:value={formEndMin}>{#each minutes as m}<option value={m}>{m}</option>{/each}</select>
							<select bind:value={formEndAmPm}><option value="AM">AM</option><option value="PM">PM</option></select>
						</div>
					</div>

					<!-- Next Day -->
					<div class="switch-row">
						<span>Next day shift</span>
						<button class="switch" class:on={formNextDay} onclick={() => formNextDay = !formNextDay}>
							<span class="switch-track"><span class="switch-thumb"></span></span>
						</button>
					</div>

					{#if isMultiShift}
						<div class="add-entry-bar">
							<span>{currentEntryHours}h</span>
							<button class="btn primary small" onclick={addShiftEntry}>+ Add</button>
						</div>
					{/if}

					<!-- Buffers -->
					<div class="form-row-2">
						<div class="form-group">
							<label>Start Buffer (hrs)</label>
							<input type="number" bind:value={formStartBuffer} min="0" max="12" step="0.5" />
						</div>
						<div class="form-group">
							<label>End Buffer (hrs)</label>
							<input type="number" bind:value={formEndBuffer} min="0" max="12" step="0.5" />
						</div>
					</div>

					<!-- Date -->
					{#if modalMode === 'add'}
						<div class="form-group">
							<label>Start Date</label>
							<input type="date" bind:value={formStartDate} />
						</div>
					{:else}
						<div class="form-group">
							<label>New Start Date <span class="req">*</span></label>
							<input type="date" bind:value={formChangeDate} />
							<span class="hint">Previous shift ends one day before.</span>
						</div>
					{/if}

					<!-- Total -->
					<div class="total-bar">
						<span>Total Hours</span>
						<strong>{grandTotalHours}h</strong>
					</div>

					<!-- Actions -->
					<div class="sheet-actions">
						<button class="btn secondary" onclick={() => modalOpen = false}>Cancel</button>
						{#if modalMode === 'change' && permEdit}
							<button class="btn danger" onclick={startEndShift}>End Shift</button>
						{/if}
						<button class="btn primary" onclick={handleSave} disabled={saving || (modalMode === 'change' && !formChangeDate) || (isMultiShift && shiftEntries.length === 0)}>
							{saving ? 'Saving...' : modalMode === 'add' ? 'Save' : 'Change'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- ==================== WEEKDAY SHIFT BOTTOM SHEET ==================== -->
{#if wdModalOpen}
	<div class="sheet-overlay" onclick={() => wdModalOpen = false}>
		<div class="bottom-sheet" onclick={(e) => e.stopPropagation()}>
			<div class="sheet-handle"></div>
			<div class="sheet-header">
				<h3>{wdModalMode === 'add' ? 'Add Weekday Shift' : 'Change Weekday Shift'}</h3>
				<span class="sheet-subtitle">{wdUserName}</span>
			</div>

			<div class="sheet-body">
				{#if wdEndShiftMode}
					<div class="form-group">
						<label>End Date</label>
						<input type="date" bind:value={wdEndShiftDate} />
						<span class="hint">Weekday shift will be marked inactive.</span>
					</div>
					<div class="sheet-actions">
						<button class="btn secondary" onclick={() => wdEndShiftMode = false}>Back</button>
						<button class="btn danger" onclick={handleEndWeekdayShift} disabled={wdEndShiftSaving || !wdEndShiftDate}>
							{wdEndShiftSaving ? 'Ending...' : 'Confirm End'}
						</button>
					</div>
				{:else}
					<!-- Weekday -->
					<div class="form-group">
						<label>Week Day</label>
						{#if wdModalMode === 'add'}
							<select bind:value={wdWeekday}>
								{#each weekdays as day}<option value={day}>{capitalizeDay(day)}</option>{/each}
							</select>
						{:else}
							<div class="fixed-value">{capitalizeDay(wdWeekday)}</div>
						{/if}
					</div>

					<!-- Shift Type Toggle -->
					<div class="toggle-row">
						<button class="toggle-opt" class:active={!wdIsMulti} onclick={() => { wdIsMulti = false; wdShiftEntries = []; }}>Single</button>
						<button class="toggle-opt" class:active={wdIsMulti} onclick={() => { wdIsMulti = true; }}>Multiple</button>
					</div>

					<!-- Existing multi entries -->
					{#if wdIsMulti && wdShiftEntries.length > 0}
						<div class="entries-box">
							<div class="entries-title">Added Shifts</div>
							{#each wdShiftEntries as entry, idx}
								<div class="entry-item">
									<span class="entry-num">{idx + 1}.</span>
									<span class="entry-time">{entry.start_time} – {entry.end_time}{#if entry.is_next_day} <span class="next-day">+1</span>{/if}</span>
									<span class="entry-hrs">{entry.total_hours}h</span>
									<button class="entry-del" onclick={() => removeWdEntry(idx)}>✕</button>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Time Pickers -->
					<div class="form-group">
						<label>{wdIsMulti ? 'New Shift — Start' : 'Start Time'}</label>
						<div class="time-picker">
							<select bind:value={wdStartHour}>{#each hours12 as h}<option value={h}>{h}</option>{/each}</select>
							<span class="colon">:</span>
							<select bind:value={wdStartMin}>{#each minutes as m}<option value={m}>{m}</option>{/each}</select>
							<select bind:value={wdStartAmPm}><option value="AM">AM</option><option value="PM">PM</option></select>
						</div>
					</div>
					<div class="form-group">
						<label>{wdIsMulti ? 'New Shift — End' : 'End Time'}</label>
						<div class="time-picker">
							<select bind:value={wdEndHour}>{#each hours12 as h}<option value={h}>{h}</option>{/each}</select>
							<span class="colon">:</span>
							<select bind:value={wdEndMin}>{#each minutes as m}<option value={m}>{m}</option>{/each}</select>
							<select bind:value={wdEndAmPm}><option value="AM">AM</option><option value="PM">PM</option></select>
						</div>
					</div>

					<!-- Next Day -->
					<div class="switch-row">
						<span>Next day shift</span>
						<button class="switch" class:on={wdNextDay} onclick={() => wdNextDay = !wdNextDay}>
							<span class="switch-track"><span class="switch-thumb"></span></span>
						</button>
					</div>

					{#if wdIsMulti}
						<div class="add-entry-bar">
							<span>{wdCurrentEntryHours}h</span>
							<button class="btn primary small" onclick={addWdEntry}>+ Add</button>
						</div>
					{/if}

					<!-- Buffers -->
					<div class="form-row-2">
						<div class="form-group">
							<label>Start Buffer (hrs)</label>
							<input type="number" bind:value={wdStartBuffer} min="0" max="12" step="0.5" />
						</div>
						<div class="form-group">
							<label>End Buffer (hrs)</label>
							<input type="number" bind:value={wdEndBuffer} min="0" max="12" step="0.5" />
						</div>
					</div>

					<!-- Date -->
					{#if wdModalMode === 'add'}
						<div class="form-group">
							<label>Start Date</label>
							<input type="date" bind:value={wdStartDate} />
						</div>
					{:else}
						<div class="form-group">
							<label>New Start Date <span class="req">*</span></label>
							<input type="date" bind:value={wdChangeDate} />
							<span class="hint">Previous shift ends one day before.</span>
						</div>
					{/if}

					<!-- Total -->
					<div class="total-bar">
						<span>Total Hours</span>
						<strong>{wdGrandTotal}h</strong>
					</div>

					<!-- Actions -->
					<div class="sheet-actions">
						<button class="btn secondary" onclick={() => wdModalOpen = false}>Cancel</button>
						{#if wdModalMode === 'change' && permEdit}
							<button class="btn danger" onclick={startWdEndShift}>End Shift</button>
						{/if}
						<button class="btn primary" onclick={handleWdSave} disabled={wdSaving || (wdModalMode === 'change' && !wdChangeDate) || (wdIsMulti && wdShiftEntries.length === 0)}>
							{wdSaving ? 'Saving...' : wdModalMode === 'add' ? 'Save' : 'Change'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- ==================== SPECIAL DATE BOTTOM SHEET ==================== -->
{#if sdModalOpen}
	<div class="sheet-overlay" onclick={() => sdModalOpen = false}>
		<div class="bottom-sheet" onclick={(e) => e.stopPropagation()}>
			<div class="sheet-handle"></div>
			<div class="sheet-header">
				<h3>Add Special Date Shift</h3>
			</div>

			<div class="sheet-body">
				<!-- Employee Picker -->
				<div class="form-group">
					<label>Employee</label>
					<div class="emp-picker-wrap">
						<input type="text" placeholder="Search employee..." bind:value={sdEmpSearch}
							onfocus={() => sdEmpDropdownOpen = true} />
						{#if sdEmpDropdownOpen && filteredSdEmps.length > 0}
							<div class="emp-dropdown">
								{#each filteredSdEmps as emp}
									<button class="emp-opt" onclick={() => selectSdEmp(emp)}>
										<span class="emp-opt-code">{emp.employee_code}</span>
										<span class="emp-opt-name">{emp.full_name}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Date Range -->
				<div class="form-row-2">
					<div class="form-group">
						<label>Start Date</label>
						<input type="date" bind:value={sdStartDate} />
					</div>
					<div class="form-group">
						<label>End Date</label>
						<input type="date" bind:value={sdEndDate} />
					</div>
				</div>

				<!-- Shift Type Toggle -->
				<div class="toggle-row">
					<button class="toggle-opt" class:active={!sdIsMulti} onclick={() => { sdIsMulti = false; sdShiftEntries = []; }}>Single</button>
					<button class="toggle-opt" class:active={sdIsMulti} onclick={() => { sdIsMulti = true; }}>Multiple</button>
				</div>

				<!-- Existing multi entries -->
				{#if sdIsMulti && sdShiftEntries.length > 0}
					<div class="entries-box">
						<div class="entries-title">Added Shifts</div>
						{#each sdShiftEntries as entry, idx}
							<div class="entry-item">
								<span class="entry-num">{idx + 1}.</span>
								<span class="entry-time">{entry.start_time} – {entry.end_time}{#if entry.is_next_day} <span class="next-day">+1</span>{/if}</span>
								<span class="entry-hrs">{entry.total_hours}h</span>
								<button class="entry-del" onclick={() => removeSdEntry(idx)}>✕</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Time Pickers -->
				<div class="form-group">
					<label>{sdIsMulti ? 'New Shift — Start' : 'Start Time'}</label>
					<div class="time-picker">
						<select bind:value={sdStartHour}>{#each hours12 as h}<option value={h}>{h}</option>{/each}</select>
						<span class="colon">:</span>
						<select bind:value={sdStartMin}>{#each minutes as m}<option value={m}>{m}</option>{/each}</select>
						<select bind:value={sdStartAmPm}><option value="AM">AM</option><option value="PM">PM</option></select>
					</div>
				</div>
				<div class="form-group">
					<label>{sdIsMulti ? 'New Shift — End' : 'End Time'}</label>
					<div class="time-picker">
						<select bind:value={sdEndHour}>{#each hours12 as h}<option value={h}>{h}</option>{/each}</select>
						<span class="colon">:</span>
						<select bind:value={sdEndMin}>{#each minutes as m}<option value={m}>{m}</option>{/each}</select>
						<select bind:value={sdEndAmPm}><option value="AM">AM</option><option value="PM">PM</option></select>
					</div>
				</div>

				<!-- Next Day -->
				<div class="switch-row">
					<span>Next day shift</span>
					<button class="switch" class:on={sdNextDay} onclick={() => sdNextDay = !sdNextDay}>
						<span class="switch-track"><span class="switch-thumb"></span></span>
					</button>
				</div>

				{#if sdIsMulti}
					<div class="add-entry-bar">
						<span>{sdCurrentEntryHours}h</span>
						<button class="btn primary small" onclick={addSdEntry}>+ Add</button>
					</div>
				{/if}

				<!-- Buffers -->
				<div class="form-row-2">
					<div class="form-group">
						<label>Start Buffer (hrs)</label>
						<input type="number" bind:value={sdStartBuffer} min="0" max="12" step="0.5" />
					</div>
					<div class="form-group">
						<label>End Buffer (hrs)</label>
						<input type="number" bind:value={sdEndBuffer} min="0" max="12" step="0.5" />
					</div>
				</div>

				<!-- Summary -->
				<div class="summary-bar">
					<div class="summary-item"><span>Days</span><strong>{sdTotalDays}</strong></div>
					<div class="summary-item"><span>Hours/Day</span><strong>{sdGrandTotal}h</strong></div>
				</div>

				<!-- Actions -->
				<div class="sheet-actions">
					<button class="btn secondary" onclick={() => sdModalOpen = false}>Cancel</button>
					<button class="btn primary" onclick={handleSdSave} disabled={sdSaving || (sdIsMulti && sdShiftEntries.length === 0)}>
						{sdSaving ? 'Saving...' : 'Add Shift'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Page Layout */
	.page {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: #F8F8F5;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	/* Tab Bar */
	.tab-bar {
		display: flex;
		background: white;
		border-bottom: 1px solid #e5e5e5;
		padding: 0;
	}
	.tab {
		flex: 1;
		padding: 12px 8px;
		border: none;
		background: none;
		font-size: 13px;
		font-weight: 600;
		color: #999;
		cursor: pointer;
		border-bottom: 3px solid transparent;
		transition: all 0.2s;
	}
	.tab.active {
		color: #0E5A3C;
		border-bottom-color: #0E5A3C;
	}

	/* Search */
	.search-bar {
		padding: 12px 16px;
		background: white;
		border-bottom: 1px solid #eee;
	}
	.search-bar input {
		width: 100%;
		padding: 10px 14px;
		border: 1.5px solid #e0e0e0;
		border-radius: 10px;
		font-size: 14px;
		background: #F8F8F5;
		box-sizing: border-box;
	}
	.search-bar input:focus {
		outline: none;
		border-color: #0E5A3C;
		background: white;
	}
	.search-row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.search-row input {
		flex: 1;
	}
	.fab-inline {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		border: none;
		background: #0E5A3C;
		color: white;
		font-size: 22px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	/* Content */
	.content {
		flex: 1;
		overflow-y: auto;
		padding: 12px 16px 80px;
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: #999;
		text-align: center;
	}
	.empty-icon {
		font-size: 48px;
		margin-bottom: 12px;
		opacity: 0.6;
	}
	.empty-state h3 {
		margin: 0 0 4px;
		font-size: 16px;
		color: #555;
	}
	.empty-state p {
		margin: 0;
		font-size: 14px;
	}
	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e0e0e0;
		border-top-color: #0E5A3C;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 12px;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Card List */
	.card-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.emp-card {
		background: white;
		border-radius: 14px;
		padding: 14px 16px;
		box-shadow: 0 1px 4px rgba(0,0,0,0.06);
		border: 1px solid #eee;
	}
	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.emp-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.emp-code {
		font-size: 11px;
		font-weight: 700;
		color: #0E5A3C;
		font-family: monospace;
		letter-spacing: 0.5px;
	}
	.emp-name {
		font-size: 15px;
		font-weight: 600;
		color: #222;
	}

	/* Action Buttons */
	.action-btn {
		padding: 6px 14px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 700;
		border: none;
		cursor: pointer;
	}
	.action-btn.add {
		background: #dcfce7;
		color: #166534;
	}
	.action-btn.change {
		background: #fef3c7;
		color: #92400e;
	}
	.action-btn.delete {
		background: #fee2e2;
		color: #dc2626;
	}

	/* Shift Pills */
	.card-shifts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}
	.shift-pill {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 8px;
	}
	.pill-time {
		font-size: 12px;
		font-weight: 600;
		color: #166534;
	}
	.next-day {
		font-size: 9px;
		background: #fef3c7;
		color: #92400e;
		padding: 1px 4px;
		border-radius: 3px;
		font-weight: 700;
	}

	/* Card Meta */
	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.meta-item {
		font-size: 12px;
		color: #888;
	}
	.meta-item strong {
		color: #0E5A3C;
	}
	.no-shift-label {
		font-size: 13px;
		color: #bbb;
		font-style: italic;
		padding: 4px 0;
	}

	/* Weekday Grid */
	.weekday-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
		margin-top: 4px;
	}
	.day-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 2px;
		border-radius: 8px;
		border: 1px solid #e5e5e5;
		background: #fafafa;
		cursor: default;
		font-size: 10px;
	}
	.day-cell.has-shift {
		background: #dbeafe;
		border-color: #93c5fd;
		cursor: pointer;
	}
	.day-cell.has-shift:active {
		background: #bfdbfe;
	}
	.day-abbr {
		font-size: 9px;
		font-weight: 700;
		color: #888;
		letter-spacing: 0.3px;
	}
	.day-cell.has-shift .day-abbr {
		color: #1e40af;
	}
	.day-hrs {
		font-size: 12px;
		font-weight: 800;
		color: #1e40af;
	}
	.day-dash {
		font-size: 12px;
		color: #ccc;
	}

	/* ==================== Bottom Sheet ==================== */
	.sheet-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.45);
		z-index: 1000;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.bottom-sheet {
		background: white;
		border-radius: 20px 20px 0 0;
		width: 100%;
		max-width: 500px;
		max-height: 92dvh;
		overflow-y: auto;
		animation: slideUp 0.3s ease;
	}
	@keyframes slideUp {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
	.sheet-handle {
		width: 36px;
		height: 4px;
		background: #ddd;
		border-radius: 2px;
		margin: 10px auto 0;
	}
	.sheet-header {
		padding: 16px 20px 8px;
	}
	.sheet-header h3 {
		margin: 0;
		font-size: 17px;
		font-weight: 700;
		color: #222;
	}
	.sheet-subtitle {
		font-size: 13px;
		color: #C9A24D;
		font-weight: 600;
	}

	.sheet-body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* Form */
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.form-group label {
		font-size: 12px;
		font-weight: 700;
		color: #555;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}
	.form-group input[type="number"],
	.form-group input[type="date"],
	.form-group input[type="text"],
	.form-group select {
		padding: 10px 14px;
		border: 1.5px solid #e0e0e0;
		border-radius: 10px;
		font-size: 14px;
		background: #F8F8F5;
		color: #222;
		box-sizing: border-box;
		width: 100%;
	}
	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #0E5A3C;
		background: white;
	}
	.req { color: #dc2626; }
	.hint {
		font-size: 11px;
		color: #999;
	}
	.fixed-value {
		padding: 10px 14px;
		background: #f5f5f5;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 500;
		text-transform: capitalize;
		color: #333;
	}

	/* Time Picker */
	.time-picker {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.time-picker select {
		flex: 1;
		padding: 10px 8px;
		border: 1.5px solid #e0e0e0;
		border-radius: 10px;
		font-size: 14px;
		background: #F8F8F5;
		text-align: center;
	}
	.time-picker select:focus {
		outline: none;
		border-color: #0E5A3C;
		background: white;
	}
	.colon {
		font-size: 18px;
		font-weight: 700;
		color: #999;
	}

	/* Toggle Row */
	.toggle-row {
		display: flex;
		border: 1.5px solid #e0e0e0;
		border-radius: 10px;
		overflow: hidden;
	}
	.toggle-opt {
		flex: 1;
		padding: 10px;
		border: none;
		background: white;
		font-size: 13px;
		font-weight: 600;
		color: #888;
		cursor: pointer;
		transition: all 0.2s;
	}
	.toggle-opt.active {
		background: #0E5A3C;
		color: white;
	}

	/* Switch */
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 0;
	}
	.switch-row span {
		font-size: 13px;
		font-weight: 600;
		color: #555;
	}
	.switch {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.switch-track {
		display: block;
		width: 44px;
		height: 24px;
		border-radius: 12px;
		background: #ddd;
		position: relative;
		transition: background 0.2s;
	}
	.switch.on .switch-track {
		background: #0E5A3C;
	}
	.switch-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
		transition: transform 0.2s;
	}
	.switch.on .switch-thumb {
		transform: translateX(20px);
	}

	/* Entries Box */
	.entries-box {
		border: 1px solid #e0e0e0;
		border-radius: 12px;
		overflow: hidden;
	}
	.entries-title {
		padding: 8px 14px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: #666;
		background: #f7f7f7;
		border-bottom: 1px solid #e0e0e0;
	}
	.entry-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid #f0f0f0;
	}
	.entry-item:last-child {
		border-bottom: none;
	}
	.entry-num {
		font-size: 11px;
		color: #999;
		min-width: 18px;
	}
	.entry-time {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
		color: #333;
	}
	.entry-hrs {
		font-size: 13px;
		font-weight: 700;
		color: #0E5A3C;
	}
	.entry-del {
		background: none;
		border: none;
		color: #dc2626;
		font-size: 16px;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 6px;
	}
	.entry-del:active {
		background: #fee2e2;
	}

	/* Add Entry Bar */
	.add-entry-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: #f0fdf4;
		border: 1px dashed #86efac;
		border-radius: 10px;
	}
	.add-entry-bar span {
		font-size: 15px;
		font-weight: 700;
		color: #0E5A3C;
	}

	/* Form Row */
	.form-row-2 {
		display: flex;
		gap: 12px;
	}
	.form-row-2 .form-group {
		flex: 1;
	}

	/* Total Bar */
	.total-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 12px;
	}
	.total-bar span {
		font-size: 13px;
		font-weight: 600;
		color: #555;
	}
	.total-bar strong {
		font-size: 22px;
		font-weight: 800;
		color: #0E5A3C;
	}

	/* Summary Bar */
	.summary-bar {
		display: flex;
		gap: 16px;
		padding: 14px 16px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 12px;
	}
	.summary-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
	}
	.summary-item span {
		font-size: 11px;
		color: #888;
	}
	.summary-item strong {
		font-size: 18px;
		font-weight: 800;
		color: #0E5A3C;
	}

	/* Buttons */
	.sheet-actions {
		display: flex;
		gap: 10px;
		padding-top: 4px;
	}
	.btn {
		flex: 1;
		padding: 12px 16px;
		border: none;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 0.2s;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: #0E5A3C;
		color: white;
	}
	.btn.primary:active:not(:disabled) {
		background: #0A3F2C;
	}
	.btn.secondary {
		background: #f0f0f0;
		color: #555;
	}
	.btn.danger {
		background: #dc2626;
		color: white;
	}
	.btn.danger:active:not(:disabled) {
		background: #b91c1c;
	}
	.btn.small {
		flex: none;
		padding: 8px 16px;
		font-size: 13px;
	}

	/* Employee Picker (Special Date) */
	.emp-picker-wrap {
		position: relative;
	}
	.emp-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		max-height: 200px;
		overflow-y: auto;
		background: white;
		border: 1px solid #ddd;
		border-radius: 10px;
		box-shadow: 0 6px 20px rgba(0,0,0,0.12);
		z-index: 10;
		margin-top: 4px;
	}
	.emp-opt {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 14px;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		font-size: 14px;
	}
	.emp-opt:active {
		background: #f0fdf4;
	}
	.emp-opt-code {
		font-weight: 700;
		color: #0E5A3C;
		min-width: 60px;
		font-family: monospace;
	}
	.emp-opt-name {
		color: #333;
	}
</style>
