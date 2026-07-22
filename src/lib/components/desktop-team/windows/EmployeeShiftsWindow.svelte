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
	let activeTab = $state<'regular' | 'special_weekday' | 'special_date'>('regular');

	// ===== REGULAR TAB =====
	type SubShift = { id: string; start_time: string; end_time: string; is_next_day: boolean; total_hours: number; };
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
	let employees = $state<EmpShift[]>([]);
	let regularSearch = $state('');
	const filteredEmployees = $derived(
		regularSearch.trim() ? employees.filter(e => e.full_name.toLowerCase().includes(regularSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(regularSearch.toLowerCase())) : employees
	);

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'change'>('add');
	let modalUserId = $state('');
	let modalUserName = $state('');
	let saving = $state(false);

	// Multi-shift toggle
	let isMultiShift = $state(false);
	type ShiftEntry = { start_time: string; end_time: string; is_next_day: boolean; total_hours: number; };
	let shiftEntries = $state<ShiftEntry[]>([]);

	// Form fields (for building one shift at a time)
	let formStartHour = $state('09');
	let formStartMin = $state('00');
	let formStartAmPm = $state<'AM' | 'PM'>('AM');
	let formEndHour = $state('05');
	let formEndMin = $state('00');
	let formEndAmPm = $state<'AM' | 'PM'>('PM');
	let formStartBuffer = $state(3);
	let formEndBuffer = $state(3);
	let formNextDay = $state(false);
	let formStartDate = $state(todayStr());
	let formChangeDate = $state('');

	function todayStr(): string {
		return new Date().toISOString().split('T')[0];
	}

	const hours12 = ['12','01','02','03','04','05','06','07','08','09','10','11'];
	const minutes = ['00','15','30','45'];

	// Calculate total hours for current form entry
	let currentEntryHours = $derived(calcEntryHours(formStartHour, formStartMin, formStartAmPm, formEndHour, formEndMin, formEndAmPm, formNextDay));

	function calcEntryHours(sH: string, sM: string, sAP: string, eH: string, eM: string, eAP: string, nextDay: boolean): number {
		let startH = parseInt(sH) % 12 + (sAP === 'PM' ? 12 : 0);
		let endH = parseInt(eH) % 12 + (eAP === 'PM' ? 12 : 0);
		let startTotal = startH * 60 + parseInt(sM);
		let endTotal = endH * 60 + parseInt(eM);
		if (nextDay) endTotal += 24 * 60;
		else if (endTotal <= startTotal) endTotal += 24 * 60;
		return Math.round((endTotal - startTotal) / 60 * 100) / 100;
	}

	// Grand total = sum of all entries (multi) or just currentEntryHours (single)
	let grandTotalHours = $derived(
		isMultiShift
			? shiftEntries.reduce((sum, e) => sum + e.total_hours, 0)
			: currentEntryHours
	);

	function addShiftEntry() {
		const startTime = `${formStartHour}:${formStartMin} ${formStartAmPm}`;
		const endTime = `${formEndHour}:${formEndMin} ${formEndAmPm}`;
		shiftEntries = [...shiftEntries, { start_time: startTime, end_time: endTime, is_next_day: formNextDay, total_hours: currentEntryHours }];
		// Reset form for next entry
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

		// Determine if existing assignment is multi-shift
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
		// Build shifts array
		let shiftsPayload: {start_time: string; end_time: string; is_next_day: boolean; total_hours: number}[];

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

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	$effect(() => { if (activeTab === 'regular') loadEmployees(); });
	$effect(() => { if (activeTab === 'special_weekday') loadWeekdayShifts(); });

	// ===== WEEKDAY SHIFTS =====
	type WdSubShift = { id: string; start_time: string; end_time: string; is_next_day: boolean; total_hours: number; start_buffer_hours: number; end_buffer_hours: number; };
	type WeekdayShiftGroup = { weekday: string; shift_group_id: string; shifts: WdSubShift[]; total_hours: number; shift_start_date: string; };
	type EmpWeekday = { user_id: string; employee_code: string; full_name: string; whatsapp_number: string; weekday_shifts: WeekdayShiftGroup[] | null; };

	let wdLoading = $state(false);
	let wdEmployees = $state<EmpWeekday[]>([]);
	let wdSearch = $state('');
	const filteredWdEmployees = $derived(
		wdSearch.trim() ? wdEmployees.filter(e => e.full_name.toLowerCase().includes(wdSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(wdSearch.toLowerCase())) : wdEmployees
	);
	let wdModalOpen = $state(false);
	let wdModalMode = $state<'add' | 'change'>('add');
	let wdUserId = $state('');
	let wdUserName = $state('');
	let wdWeekday = $state('monday');
	let wdSaving = $state(false);

	// Multi-shift for weekday
	let wdIsMulti = $state(false);
	let wdShiftEntries = $state<ShiftEntry[]>([]);

	// Weekday form
	let wdStartHour = $state('09');
	let wdStartMin = $state('00');
	let wdStartAmPm = $state<'AM' | 'PM'>('AM');
	let wdEndHour = $state('05');
	let wdEndMin = $state('00');
	let wdEndAmPm = $state<'AM' | 'PM'>('PM');
	let wdStartBuffer = $state(3);
	let wdEndBuffer = $state(3);
	let wdNextDay = $state(false);
	let wdStartDate = $state(todayStr());
	let wdChangeDate = $state('');

	let wdCurrentEntryHours = $derived(calcEntryHours(wdStartHour, wdStartMin, wdStartAmPm, wdEndHour, wdEndMin, wdEndAmPm, wdNextDay));
	let wdGrandTotal = $derived(
		wdIsMulti
			? wdShiftEntries.reduce((sum, e) => sum + e.total_hours, 0)
			: wdCurrentEntryHours
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

	const weekdays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

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

	function capitalizeDay(d: string): string { return d.charAt(0).toUpperCase() + d.slice(1, 3); }

	// ===== SPECIAL DATE SHIFTS =====
	type DateShift = {
		id: string; user_id: string; employee_code: string; full_name: string;
		start_date: string; end_date: string; total_days: number;
		total_hours: number; created_at: string;
		shifts: SubShift[];
	};

	let sdLoading = $state(false);
	let sdShifts = $state<DateShift[]>([]);
	let sdSearch = $state('');
	const filteredSdShifts = $derived(
		sdSearch.trim() ? sdShifts.filter(s => s.full_name.toLowerCase().includes(sdSearch.toLowerCase()) || s.employee_code.toLowerCase().includes(sdSearch.toLowerCase())) : sdShifts
	);

	// Modal
	let sdModalOpen = $state(false);
	let sdSaving = $state(false);
	let sdUserId = $state('');
	let sdUserName = $state('');
	let sdStartDate = $state(todayStr());
	let sdEndDate = $state(todayStr());
	let sdStartHour = $state('09');
	let sdStartMin = $state('00');
	let sdStartAmPm = $state<'AM' | 'PM'>('AM');
	let sdEndHour = $state('05');
	let sdEndMin = $state('00');
	let sdEndAmPm = $state<'AM' | 'PM'>('PM');
	let sdStartBuffer = $state(3);
	let sdEndBuffer = $state(3);
	let sdNextDay = $state(false);

	// Multi-shift for date
	let sdIsMulti = $state(false);
	let sdShiftEntries = $state<ShiftEntry[]>([]);

	// Employee list for picker
	let sdEmployees = $state<{user_id: string; employee_code: string; full_name: string}[]>([]);
	let sdEmpSearch = $state('');
	let sdEmpDropdownOpen = $state(false);
	const filteredSdEmps = $derived(
		sdEmpSearch.trim() ? sdEmployees.filter(e => e.full_name.toLowerCase().includes(sdEmpSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(sdEmpSearch.toLowerCase())) : sdEmployees
	);

	let sdCurrentEntryHours = $derived(calcEntryHours(sdStartHour, sdStartMin, sdStartAmPm, sdEndHour, sdEndMin, sdEndAmPm, sdNextDay));
	let sdGrandTotal = $derived(
		sdIsMulti
			? sdShiftEntries.reduce((sum, e) => sum + e.total_hours, 0)
			: sdCurrentEntryHours
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

	$effect(() => { if (activeTab === 'special_date') loadDateShifts(); });
</script>

<div class="shifts-window">
	<!-- Tab Navigation -->
	<div class="tab-bar">
		<button class="tab-btn" class:active={activeTab === 'regular'} onclick={() => activeTab = 'regular'}>
			<span class="tab-icon">🕐</span>
			<span class="tab-label">Regular</span>
		</button>
		<button class="tab-btn" class:active={activeTab === 'special_weekday'} onclick={() => activeTab = 'special_weekday'}>
			<span class="tab-icon">📅</span>
			<span class="tab-label">Special (Week Day)</span>
		</button>
		<button class="tab-btn" class:active={activeTab === 'special_date'} onclick={() => activeTab = 'special_date'}>
			<span class="tab-icon">📌</span>
			<span class="tab-label">Special (Date Wise)</span>
		</button>
	</div>

	<!-- Content Area -->
	<div class="tab-content">
		{#if activeTab === 'regular'}
			{#if loading}
				<div class="content-placeholder"><p>Loading...</p></div>
			{:else if employees.length === 0}
				<div class="content-placeholder"><p>No active employees found.</p></div>
			{:else}
				<div class="table-search">
					<input type="text" placeholder="Search by name or code..." bind:value={regularSearch} />
				</div>
				<div class="table-wrap">
					<table class="data-table">
						<thead><tr>
							<th class="col-sl">#</th>
							<th>Code</th>
							<th>Name</th>
							<th>Contact</th>
							<th>Shift</th>
							<th>Hours</th>
							<th>Since</th>
							<th>Action</th>
						</tr></thead>
						<tbody>
							{#each filteredEmployees as emp, i}
								<tr>
									<td class="col-sl">{i + 1}</td>
									<td class="col-code">{emp.employee_code}</td>
									<td class="col-name">{emp.full_name}</td>
									<td class="col-phone">{emp.whatsapp_number}</td>
									<td class="col-shift">
										{#if emp.shifts && emp.shifts.length > 0}
											{#each emp.shifts as s, si}
												{#if si > 0}<span class="shift-sep"> | </span>{/if}
												<span class="shift-time">{s.start_time} – {s.end_time}{#if s.is_next_day}<span class="next-day-badge">+1</span>{/if}</span>
											{/each}
										{:else}
											<span class="no-shift">No shift</span>
										{/if}
									</td>
									<td class="col-hours">{emp.shifts && emp.shifts.length > 0 ? emp.total_hours + 'h' : '—'}</td>
									<td class="col-date">{formatDate(emp.shift_start_date)}</td>
									<td class="col-action">
										{#if emp.shifts && emp.shifts.length > 0}
											{#if permEdit}<button class="btn-action btn-change" onclick={() => openChange(emp)}>Change</button>{/if}
										{:else}
											{#if permAdd}<button class="btn-action btn-add" onclick={() => openAdd(emp)}>Add</button>{/if}
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else if activeTab === 'special_weekday'}
			{#if wdLoading}
				<div class="content-placeholder"><p>Loading...</p></div>
			{:else if wdEmployees.length === 0}
				<div class="content-placeholder"><p>No active employees found.</p></div>
			{:else}
				<div class="table-search">
					<input type="text" placeholder="Search by name or code..." bind:value={wdSearch} />
				</div>
				<div class="table-wrap">
					<table class="data-table">
						<thead><tr>
							<th class="col-sl">#</th>
							<th>Code</th>
							<th>Name</th>
							<th>Mon</th>
							<th>Tue</th>
							<th>Wed</th>
							<th>Thu</th>
							<th>Fri</th>
							<th>Sat</th>
							<th>Sun</th>
							<th>Action</th>
						</tr></thead>
						<tbody>
							{#each filteredWdEmployees as emp, i}
								<tr>
									<td class="col-sl">{i + 1}</td>
									<td class="col-code">{emp.employee_code}</td>
									<td class="col-name">{emp.full_name}</td>
									{#each weekdays as day}
										{@const shiftGroup = emp.weekday_shifts?.find(s => s.weekday === day)}
										<td class="col-day">
											{#if shiftGroup}
												<button class="day-shift-btn" onclick={() => openWdChange(emp, shiftGroup)} title={shiftGroup.shifts.map(s => s.start_time + ' – ' + s.end_time).join(' | ')}>
													<span class="day-hours">{shiftGroup.total_hours}h</span>
													<span class="day-time">
														{#if shiftGroup.shifts.length === 1}
															{shiftGroup.shifts[0].start_time} – {shiftGroup.shifts[0].end_time}
														{:else}
															{shiftGroup.shifts.length} shifts
														{/if}
													</span>
												</button>
											{:else}
												<span class="day-empty">—</span>
											{/if}
										</td>
									{/each}
									<td class="col-action">
										{#if permAdd}<button class="btn-action btn-add" onclick={() => openWdAdd(emp)}>Add</button>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else if activeTab === 'special_date'}
			<div class="sd-toolbar">
				<input type="text" class="sd-search" placeholder="Search by name or code..." bind:value={sdSearch} />
				{#if permAdd}<button class="btn-action btn-add" onclick={openSdAdd}>+ Add Special Date Shift</button>{/if}
			</div>
			{#if sdLoading}
				<div class="content-placeholder"><p>Loading...</p></div>
			{:else if sdShifts.length === 0}
				<div class="content-placeholder">
					<div class="ph-icon">📌</div>
					<h3>No Special Date Shifts</h3>
					<p>Click "Add Special Date Shift" to create one.</p>
				</div>
			{:else}
				<div class="table-wrap">
					<table class="data-table">
						<thead><tr>
							<th class="col-sl">#</th>
							<th>Code</th>
							<th>Name</th>
							<th>Start Date</th>
							<th>End Date</th>
							<th>Days</th>
							<th>Shift</th>
							<th>Hours</th>
							<th>Action</th>
						</tr></thead>
						<tbody>
							{#each filteredSdShifts as shift, i}
								<tr>
									<td class="col-sl">{i + 1}</td>
									<td class="col-code">{shift.employee_code}</td>
									<td class="col-name">{shift.full_name}</td>
									<td class="col-date">{formatDate(shift.start_date)}</td>
									<td class="col-date">{formatDate(shift.end_date)}</td>
									<td class="col-days">{shift.total_days}d</td>
									<td class="col-shift">
										{#each shift.shifts as s, si}
											{#if si > 0}<span class="shift-sep"> | </span>{/if}
											<span class="shift-time">{s.start_time} – {s.end_time}{#if s.is_next_day}<span class="next-day-badge">+1</span>{/if}</span>
										{/each}
									</td>
									<td class="col-hours">{shift.total_hours}h</td>
									<td class="col-action">
										{#if permDelete}<button class="btn-action btn-del" onclick={() => deleteSdShift(shift.id, shift.full_name)}>Delete</button>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Regular Shift Modal -->
{#if modalOpen}
	<div class="modal-overlay" onclick={() => modalOpen = false}>
		<div class="modal-box" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{modalMode === 'add' ? 'Add Shift' : 'Change Shift'} — {modalUserName}</h3>
				<button class="modal-close" onclick={() => modalOpen = false}>✕</button>
			</div>

			<div class="modal-body">
				<!-- Single/Multiple Toggle -->
				<div class="form-group toggle-group">
					<label>Shift Type</label>
					<div class="shift-type-toggle">
						<button class="type-btn" class:active={!isMultiShift} onclick={() => { isMultiShift = false; shiftEntries = []; }}>Single Shift</button>
						<button class="type-btn" class:active={isMultiShift} onclick={() => { isMultiShift = true; }}>Multiple Shifts</button>
					</div>
				</div>

				<!-- Added shifts list (multi mode) -->
				{#if isMultiShift && shiftEntries.length > 0}
					<div class="entries-list">
						<div class="entries-header">Added Shifts</div>
						{#each shiftEntries as entry, idx}
							<div class="entry-row">
								<span class="entry-num">{idx + 1}.</span>
								<span class="entry-time">{entry.start_time} – {entry.end_time}{#if entry.is_next_day} <span class="next-day-badge">+1</span>{/if}</span>
								<span class="entry-hours">{entry.total_hours}h</span>
								<button class="entry-remove" onclick={() => removeShiftEntry(idx)}>✕</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Start Time -->
				<div class="form-group">
					<label>{isMultiShift ? 'New Shift — Start Time' : 'Start Time'}</label>
					<div class="time-row">
						<select bind:value={formStartHour}>
							{#each hours12 as h}<option value={h}>{h}</option>{/each}
						</select>
						<span class="time-sep">:</span>
						<select bind:value={formStartMin}>
							{#each minutes as m}<option value={m}>{m}</option>{/each}
						</select>
						<select bind:value={formStartAmPm}>
							<option value="AM">AM</option>
							<option value="PM">PM</option>
						</select>
					</div>
				</div>

				<!-- End Time -->
				<div class="form-group">
					<label>{isMultiShift ? 'New Shift — End Time' : 'End Time'}</label>
					<div class="time-row">
						<select bind:value={formEndHour}>
							{#each hours12 as h}<option value={h}>{h}</option>{/each}
						</select>
						<span class="time-sep">:</span>
						<select bind:value={formEndMin}>
							{#each minutes as m}<option value={m}>{m}</option>{/each}
						</select>
						<select bind:value={formEndAmPm}>
							<option value="AM">AM</option>
							<option value="PM">PM</option>
						</select>
					</div>
				</div>

				<!-- Next Day Toggle -->
				<div class="form-group toggle-group">
					<label>Next Day Shift</label>
					<button class="toggle-btn" class:on={formNextDay} onclick={() => formNextDay = !formNextDay}>
						<span class="toggle-track"><span class="toggle-thumb"></span></span>
						<span class="toggle-label">{formNextDay ? 'Yes — ends next day' : 'No — same day'}</span>
					</button>
				</div>

				{#if isMultiShift}
					<!-- Current entry hours + Add button -->
					<div class="form-group add-entry-row">
						<span class="entry-preview">{currentEntryHours}h</span>
						<button class="btn-add-entry" onclick={addShiftEntry}>+ Add Shift</button>
					</div>
				{/if}

				<!-- Buffers -->
				<div class="form-group">
					<label>Start Buffer (hours)</label>
					<input type="number" bind:value={formStartBuffer} min="0" max="12" step="0.5" />
				</div>
				<div class="form-group">
					<label>End Buffer (hours)</label>
					<input type="number" bind:value={formEndBuffer} min="0" max="12" step="0.5" />
				</div>

				<!-- Start Date -->
				{#if modalMode === 'add'}
					<div class="form-group">
						<label>Shift Start Date</label>
						<input type="date" bind:value={formStartDate} />
					</div>
				{:else}
					<div class="form-group">
						<label>New Shift Start Date <span class="required">*</span></label>
						<input type="date" bind:value={formChangeDate} />
						<span class="hint">Previous shift will end one day before this date.</span>
					</div>
				{/if}

				<!-- Total Hours -->
				<div class="form-group total-hours-group">
					<label>Total Working Hours</label>
					<div class="total-hours-value">{grandTotalHours}h</div>
				</div>
			</div>

			{#if endShiftMode}
				<div class="end-shift-section">
					<div class="form-group">
						<label>End Date <span class="required">*</span></label>
						<input type="date" bind:value={endShiftDate} />
						<span class="hint">The shift will be marked inactive from this date.</span>
					</div>
					<div class="modal-footer">
						<button class="btn-cancel" onclick={() => endShiftMode = false}>Back</button>
						<button class="btn-end-shift" onclick={handleEndRegularShift} disabled={endShiftSaving || !endShiftDate}>
							{endShiftSaving ? 'Ending...' : 'Confirm End Shift'}
						</button>
					</div>
				</div>
			{:else}
				<div class="modal-footer">
					<button class="btn-cancel" onclick={() => modalOpen = false}>Cancel</button>
					{#if modalMode === 'add'}
						<button class="btn-save" onclick={handleSave} disabled={saving || (isMultiShift && shiftEntries.length === 0)}>
							{saving ? 'Saving...' : 'Save Shift'}
						</button>
					{:else}
						{#if permEdit}<button class="btn-end-shift" onclick={startEndShift}>End Shift</button>{/if}
						<button class="btn-save" onclick={handleSave} disabled={saving || !formChangeDate || (isMultiShift && shiftEntries.length === 0)}>
							{saving ? 'Saving...' : 'Change Shift'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Weekday Shift Modal -->
{#if wdModalOpen}
	<div class="modal-overlay" onclick={() => wdModalOpen = false}>
		<div class="modal-box" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{wdModalMode === 'add' ? 'Add Weekday Shift' : 'Change Weekday Shift'} — {wdUserName}</h3>
				<button class="modal-close" onclick={() => wdModalOpen = false}>✕</button>
			</div>

			<div class="modal-body">
				<!-- Weekday Selector -->
				<div class="form-group">
					<label>Week Day</label>
					{#if wdModalMode === 'add'}
						<select bind:value={wdWeekday}>
							{#each weekdays as day}<option value={day}>{day.charAt(0).toUpperCase() + day.slice(1)}</option>{/each}
						</select>
					{:else}
						<div class="weekday-fixed">{wdWeekday.charAt(0).toUpperCase() + wdWeekday.slice(1)}</div>
					{/if}
				</div>

				<!-- Single/Multiple Toggle -->
				<div class="form-group toggle-group">
					<label>Shift Type</label>
					<div class="shift-type-toggle">
						<button class="type-btn" class:active={!wdIsMulti} onclick={() => { wdIsMulti = false; wdShiftEntries = []; }}>Single Shift</button>
						<button class="type-btn" class:active={wdIsMulti} onclick={() => { wdIsMulti = true; }}>Multiple Shifts</button>
					</div>
				</div>

				<!-- Added shifts list (multi mode) -->
				{#if wdIsMulti && wdShiftEntries.length > 0}
					<div class="entries-list">
						<div class="entries-header">Added Shifts</div>
						{#each wdShiftEntries as entry, idx}
							<div class="entry-row">
								<span class="entry-num">{idx + 1}.</span>
								<span class="entry-time">{entry.start_time} – {entry.end_time}{#if entry.is_next_day} <span class="next-day-badge">+1</span>{/if}</span>
								<span class="entry-hours">{entry.total_hours}h</span>
								<button class="entry-remove" onclick={() => removeWdEntry(idx)}>✕</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Start Time -->
				<div class="form-group">
					<label>{wdIsMulti ? 'New Shift — Start Time' : 'Start Time'}</label>
					<div class="time-row">
						<select bind:value={wdStartHour}>
							{#each hours12 as h}<option value={h}>{h}</option>{/each}
						</select>
						<span class="time-sep">:</span>
						<select bind:value={wdStartMin}>
							{#each minutes as m}<option value={m}>{m}</option>{/each}
						</select>
						<select bind:value={wdStartAmPm}>
							<option value="AM">AM</option>
							<option value="PM">PM</option>
						</select>
					</div>
				</div>

				<!-- End Time -->
				<div class="form-group">
					<label>{wdIsMulti ? 'New Shift — End Time' : 'End Time'}</label>
					<div class="time-row">
						<select bind:value={wdEndHour}>
							{#each hours12 as h}<option value={h}>{h}</option>{/each}
						</select>
						<span class="time-sep">:</span>
						<select bind:value={wdEndMin}>
							{#each minutes as m}<option value={m}>{m}</option>{/each}
						</select>
						<select bind:value={wdEndAmPm}>
							<option value="AM">AM</option>
							<option value="PM">PM</option>
						</select>
					</div>
				</div>

				<!-- Next Day Toggle -->
				<div class="form-group toggle-group">
					<label>Next Day Shift</label>
					<button class="toggle-btn" class:on={wdNextDay} onclick={() => wdNextDay = !wdNextDay}>
						<span class="toggle-track"><span class="toggle-thumb"></span></span>
						<span class="toggle-label">{wdNextDay ? 'Yes — ends next day' : 'No — same day'}</span>
					</button>
				</div>

				{#if wdIsMulti}
					<div class="form-group add-entry-row">
						<span class="entry-preview">{wdCurrentEntryHours}h</span>
						<button class="btn-add-entry" onclick={addWdEntry}>+ Add Shift</button>
					</div>
				{/if}

				<!-- Buffers -->
				<div class="form-group">
					<label>Start Buffer (hours)</label>
					<input type="number" bind:value={wdStartBuffer} min="0" max="12" step="0.5" />
				</div>
				<div class="form-group">
					<label>End Buffer (hours)</label>
					<input type="number" bind:value={wdEndBuffer} min="0" max="12" step="0.5" />
				</div>

				<!-- Start Date -->
				{#if wdModalMode === 'add'}
					<div class="form-group">
						<label>Shift Start Date</label>
						<input type="date" bind:value={wdStartDate} />
					</div>
				{:else}
					<div class="form-group">
						<label>New Shift Start Date <span class="required">*</span></label>
						<input type="date" bind:value={wdChangeDate} />
						<span class="hint">Previous shift will end one day before this date.</span>
					</div>
				{/if}

				<!-- Total Hours -->
				<div class="form-group total-hours-group">
					<label>Total Working Hours</label>
					<div class="total-hours-value">{wdGrandTotal}h</div>
				</div>
			</div>

			{#if wdEndShiftMode}
				<div class="end-shift-section">
					<div class="form-group">
						<label>End Date <span class="required">*</span></label>
						<input type="date" bind:value={wdEndShiftDate} />
						<span class="hint">The weekday shift will be marked inactive from this date.</span>
					</div>
					<div class="modal-footer">
						<button class="btn-cancel" onclick={() => wdEndShiftMode = false}>Back</button>
						<button class="btn-end-shift" onclick={handleEndWeekdayShift} disabled={wdEndShiftSaving || !wdEndShiftDate}>
							{wdEndShiftSaving ? 'Ending...' : 'Confirm End Shift'}
						</button>
					</div>
				</div>
			{:else}
				<div class="modal-footer">
					<button class="btn-cancel" onclick={() => wdModalOpen = false}>Cancel</button>
					{#if wdModalMode === 'add'}
						<button class="btn-save" onclick={handleWdSave} disabled={wdSaving || (wdIsMulti && wdShiftEntries.length === 0)}>
							{wdSaving ? 'Saving...' : 'Save Shift'}
						</button>
					{:else}
						{#if permEdit}<button class="btn-end-shift" onclick={startWdEndShift}>End Shift</button>{/if}
						<button class="btn-save" onclick={handleWdSave} disabled={wdSaving || !wdChangeDate || (wdIsMulti && wdShiftEntries.length === 0)}>
							{wdSaving ? 'Saving...' : 'Change Shift'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Special Date Shift Modal -->
{#if sdModalOpen}
<div class="modal-overlay" onclick={() => sdModalOpen = false} onkeydown={(e) => e.key === 'Escape' && (sdModalOpen = false)} role="dialog" tabindex="-1">
	<div class="modal-box modal-wide" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="document" tabindex="-1">
		<div class="modal-header">
			<h3>Add Special Date Shift</h3>
			<button class="modal-close" onclick={() => sdModalOpen = false}>&times;</button>
		</div>
		<div class="modal-body">
			<!-- Employee Selector -->
			<div class="form-group">
				<label>Employee</label>
				<div class="emp-picker">
					<input type="text" class="form-input" placeholder="Search employee..." bind:value={sdEmpSearch}
						onfocus={() => sdEmpDropdownOpen = true} />
					{#if sdEmpDropdownOpen && filteredSdEmps.length > 0}
						<div class="emp-dropdown">
							{#each filteredSdEmps as emp}
								<button class="emp-option" onclick={() => selectSdEmp(emp)}>
									<span class="emp-code">{emp.employee_code}</span>
									<span class="emp-name">{emp.full_name}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Date Range -->
			<div class="form-row">
				<div class="form-group half">
					<label>Start Date</label>
					<input type="date" class="form-input" bind:value={sdStartDate} />
				</div>
				<div class="form-group half">
					<label>End Date</label>
					<input type="date" class="form-input" bind:value={sdEndDate} />
				</div>
			</div>

			<!-- Single/Multiple Toggle -->
			<div class="form-group toggle-group">
				<label>Shift Type</label>
				<div class="shift-type-toggle">
					<button class="type-btn" class:active={!sdIsMulti} onclick={() => { sdIsMulti = false; sdShiftEntries = []; }}>Single Shift</button>
					<button class="type-btn" class:active={sdIsMulti} onclick={() => { sdIsMulti = true; }}>Multiple Shifts</button>
				</div>
			</div>

			<!-- Added shifts list (multi mode) -->
			{#if sdIsMulti && sdShiftEntries.length > 0}
				<div class="entries-list">
					<div class="entries-header">Added Shifts</div>
					{#each sdShiftEntries as entry, idx}
						<div class="entry-row">
							<span class="entry-num">{idx + 1}.</span>
							<span class="entry-time">{entry.start_time} – {entry.end_time}{#if entry.is_next_day} <span class="next-day-badge">+1</span>{/if}</span>
							<span class="entry-hours">{entry.total_hours}h</span>
							<button class="entry-remove" onclick={() => removeSdEntry(idx)}>✕</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Times -->
			<div class="form-row">
				<div class="form-group half">
					<label>{sdIsMulti ? 'New Shift — Start Time' : 'Start Time'}</label>
					<div class="time-row">
						<select class="form-select" bind:value={sdStartHour}>
							{#each hours12 as h}<option value={h}>{h}</option>{/each}
						</select>
						<span>:</span>
						<select class="form-select" bind:value={sdStartMin}>
							{#each minutes as m}<option value={m}>{m}</option>{/each}
						</select>
						<select class="form-select" bind:value={sdStartAmPm}>
							<option value="AM">AM</option><option value="PM">PM</option>
						</select>
					</div>
				</div>
				<div class="form-group half">
					<label>{sdIsMulti ? 'New Shift — End Time' : 'End Time'}</label>
					<div class="time-row">
						<select class="form-select" bind:value={sdEndHour}>
							{#each hours12 as h}<option value={h}>{h}</option>{/each}
						</select>
						<span>:</span>
						<select class="form-select" bind:value={sdEndMin}>
							{#each minutes as m}<option value={m}>{m}</option>{/each}
						</select>
						<select class="form-select" bind:value={sdEndAmPm}>
							<option value="AM">AM</option><option value="PM">PM</option>
						</select>
					</div>
				</div>
			</div>

			<!-- Next Day -->
			<div class="form-group">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={sdNextDay} />
					End time is next day (+1)
				</label>
			</div>

			{#if sdIsMulti}
				<div class="form-group add-entry-row">
					<span class="entry-preview">{sdCurrentEntryHours}h</span>
					<button class="btn-add-entry" onclick={addSdEntry}>+ Add Shift</button>
				</div>
			{/if}

			<!-- Buffers -->
			<div class="form-row">
				<div class="form-group half">
					<label>Start Buffer (hrs)</label>
					<input type="number" class="form-input" min="0" max="12" bind:value={sdStartBuffer} />
				</div>
				<div class="form-group half">
					<label>End Buffer (hrs)</label>
					<input type="number" class="form-input" min="0" max="12" bind:value={sdEndBuffer} />
				</div>
			</div>

			<!-- Summary -->
			<div class="shift-summary">
				<div class="summary-item"><span>Total Days:</span><strong>{sdTotalDays}</strong></div>
				<div class="summary-item"><span>Total Hours/Day:</span><strong>{sdGrandTotal}h</strong></div>
			</div>
		</div>
		<div class="modal-footer">
			<button class="btn-action btn-cancel" onclick={() => sdModalOpen = false}>Cancel</button>
			<button class="btn-action btn-save" onclick={handleSdSave} disabled={sdSaving || (sdIsMulti && sdShiftEntries.length === 0)}>
				{sdSaving ? 'Saving...' : 'Add Shift'}
			</button>
		</div>
	</div>
</div>
{/if}

<style>
	.shifts-window { display: flex; flex-direction: column; height: 100%; }

	/* Tab Bar — Glassmorphic */
	.tab-bar {
		display: flex; gap: 4px; padding: 10px 16px;
		background: rgba(255, 255, 255, 0.6);
		backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	.tab-btn {
		display: flex; align-items: center; gap: 8px; padding: 10px 20px;
		border: 1px solid rgba(14, 90, 60, 0.1); border-radius: 10px;
		background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
		cursor: pointer; transition: all 0.2s ease; font-size: 13px; font-weight: 500; color: #666;
	}
	.tab-btn:hover { background: rgba(14, 90, 60, 0.06); border-color: rgba(14, 90, 60, 0.2); transform: translateY(-1px); }
	.tab-btn.active { background: rgba(14, 90, 60, 0.1); border-color: rgba(14, 90, 60, 0.3); color: #0E5A3C; font-weight: 600; box-shadow: 0 2px 12px rgba(14, 90, 60, 0.12); }
	.tab-icon { font-size: 16px; } .tab-label { white-space: nowrap; }

	/* Content */
	.tab-content { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; }
	.content-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: #888; }
	.content-placeholder .ph-icon { font-size: 48px; opacity: 0.6; }
	.content-placeholder h3 { margin: 0; font-size: 18px; font-weight: 600; color: #2b2b2b; }
	.content-placeholder p { margin: 0; font-size: 14px; text-align: center; max-width: 360px; }

	/* Table */
	.table-search { margin-bottom: 10px; }
	.table-search input { width: 100%; max-width: 300px; padding: 8px 12px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 13px; }
	.table-search input:focus { outline: none; border-color: #0E5A3C; }
	.table-wrap { flex: 1; overflow: auto; border: 1px solid #ccc; border-radius: 8px; }
	.data-table { width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #ddd; }
	.data-table thead { background: #f7f7f7; position: sticky; top: 0; z-index: 2; }
	.data-table th { padding: 10px 10px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: #666; border: 1px solid #ddd; }
	.data-table td { padding: 8px 10px; border: 1px solid #e0e0e0; }
	.data-table tbody tr:hover td { background: #fafafa; }
	.col-sl { width: 36px; text-align: center; color: #999; font-size: 12px; }
	.col-code { font-family: monospace; font-size: 12px; color: #0E5A3C; font-weight: 600; }
	.col-name { font-weight: 500; }
	.col-phone { color: #666; font-size: 12px; }
	.col-shift { font-size: 12px; white-space: nowrap; }
	.col-hours { font-size: 12px; font-weight: 600; color: #0E5A3C; }
	.col-date { font-size: 11px; color: #888; white-space: nowrap; }
	.col-action { white-space: nowrap; }
	.no-shift { color: #bbb; font-style: italic; font-size: 12px; }
	.next-day-badge { font-size: 9px; background: #fef3c7; color: #92400e; padding: 1px 4px; border-radius: 3px; margin-left: 4px; font-weight: 600; }
	.shift-sep { color: #999; font-size: 11px; }
	.shift-time { font-size: 12px; }

	.btn-action { padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid; }
	.btn-add { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
	.btn-add:hover { background: #bbf7d0; }
	.btn-change { background: #fef3c7; color: #92400e; border-color: #fde68a; }
	.btn-change:hover { background: #fde68a; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
	.modal-box { background: white; border-radius: 12px; width: 440px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
	.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #eee; }
	.modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
	.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #999; padding: 4px 8px; }
	.modal-close:hover { color: #333; }
	.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
	.modal-footer { padding: 16px 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; }

	.form-group { display: flex; flex-direction: column; gap: 6px; }
	.form-group label { font-size: 12px; font-weight: 600; color: #555; }
	.form-group input[type="number"], .form-group input[type="date"] { padding: 8px 12px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 13px; }
	.form-group input:focus { outline: none; border-color: #0E5A3C; }
	.required { color: #dc2626; }
	.hint { font-size: 11px; color: #888; }

	.time-row { display: flex; align-items: center; gap: 6px; }
	.time-row select { padding: 8px 10px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 13px; background: white; }
	.time-row select:focus { outline: none; border-color: #0E5A3C; }
	.time-sep { font-size: 16px; font-weight: 700; color: #999; }

	.toggle-group { flex-direction: row; align-items: center; justify-content: space-between; }
	.toggle-btn { display: flex; align-items: center; gap: 10px; background: none; border: none; cursor: pointer; padding: 0; }
	.toggle-track { width: 40px; height: 22px; border-radius: 11px; background: #ddd; position: relative; transition: background 0.2s; }
	.toggle-btn.on .toggle-track { background: #0E5A3C; }
	.toggle-thumb { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: white; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
	.toggle-btn.on .toggle-thumb { transform: translateX(18px); }
	.toggle-label { font-size: 12px; color: #666; }

	/* Shift Type Toggle */
	.shift-type-toggle { display: flex; gap: 0; border: 1.5px solid #ddd; border-radius: 6px; overflow: hidden; }
	.type-btn { padding: 7px 16px; border: none; background: white; font-size: 12px; font-weight: 500; cursor: pointer; color: #666; transition: all 0.2s; }
	.type-btn.active { background: #0E5A3C; color: white; font-weight: 600; }
	.type-btn:not(.active):hover { background: #f5f5f5; }

	/* Entries list */
	.entries-list { border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
	.entries-header { padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: #666; background: #f7f7f7; border-bottom: 1px solid #e0e0e0; }
	.entry-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
	.entry-row:last-child { border-bottom: none; }
	.entry-num { font-size: 11px; color: #999; min-width: 20px; }
	.entry-time { flex: 1; font-size: 13px; font-weight: 500; }
	.entry-hours { font-size: 12px; font-weight: 600; color: #0E5A3C; }
	.entry-remove { background: none; border: none; color: #dc2626; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; }
	.entry-remove:hover { background: #fee2e2; }

	/* Add entry row */
	.add-entry-row { flex-direction: row !important; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f0fdf4; border-radius: 8px; border: 1px dashed #86efac; }
	.entry-preview { font-size: 14px; font-weight: 600; color: #0E5A3C; }
	.btn-add-entry { padding: 6px 14px; border: none; border-radius: 6px; background: #0E5A3C; color: white; font-size: 12px; font-weight: 600; cursor: pointer; }
	.btn-add-entry:hover { background: #0A3F2C; }

	.total-hours-group { flex-direction: row; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
	.total-hours-value { font-size: 20px; font-weight: 700; color: #0E5A3C; }

	.btn-cancel { padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px; background: white; font-size: 13px; cursor: pointer; }
	.btn-cancel:hover { background: #f5f5f5; }
	.btn-save { padding: 8px 20px; border: none; border-radius: 6px; background: #0E5A3C; color: white; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-save:hover { background: #0A3F2C; }
	.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-end-shift { padding: 8px 20px; border: none; border-radius: 6px; background: #c0392b; color: white; font-size: 13px; font-weight: 600; cursor: pointer; }
	.btn-end-shift:hover { background: #96281b; }
	.btn-end-shift:disabled { opacity: 0.5; cursor: not-allowed; }
	.end-shift-section { padding: 0 20px 16px; }
	.end-shift-section .form-group { margin-bottom: 12px; }
	.end-shift-section .modal-footer { padding: 0; border-top: none; }

	/* Weekday columns */
	.col-day { text-align: center; padding: 4px 2px !important; min-width: 44px; }
	.day-shift-btn { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 3px 5px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; cursor: pointer; width: 100%; }
	.day-shift-btn:hover { background: #bfdbfe; }
	.day-hours { font-size: 11px; font-weight: 700; }
	.day-time { font-size: 8px; font-weight: 400; color: #3b82f6; white-space: nowrap; }
	.day-empty { color: #ccc; font-size: 12px; }
	.weekday-fixed { padding: 8px 12px; background: #f5f5f5; border-radius: 6px; font-size: 13px; font-weight: 500; text-transform: capitalize; }
	.form-group select { padding: 8px 12px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 13px; background: white; }
	.form-group select:focus { outline: none; border-color: #0E5A3C; }

	/* Special Date tab */
	.sd-toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #eee; }
	.sd-search { flex: 1; padding: 8px 12px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 13px; }
	.sd-search:focus { outline: none; border-color: #0E5A3C; }
	.col-days { text-align: center; font-weight: 600; color: #0E5A3C; }
	.emp-picker { position: relative; }
	.emp-dropdown { position: absolute; top: 100%; left: 0; right: 0; max-height: 180px; overflow-y: auto; background: white; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10; }
	.emp-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; text-align: left; font-size: 13px; }
	.emp-option:hover { background: #f0fdf4; }
	.emp-code { font-weight: 600; color: #0E5A3C; min-width: 70px; }
	.emp-name { color: #333; }
	.form-input { width: 100%; padding: 8px 12px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
	.form-input:focus { outline: none; border-color: #0E5A3C; }
	.form-row { display: flex; gap: 12px; }
	.form-group.half { flex: 1; }
	.shift-summary { display: flex; gap: 24px; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; margin-top: 8px; }
	.summary-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
	.summary-item span { color: #666; }
	.summary-item strong { color: #0E5A3C; font-size: 15px; }
	.modal-wide { max-width: 520px; }
	.btn-del { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
	.btn-del:hover { background: #fecaca; }
	.checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; flex-direction: row !important; }
</style>
