<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { teamUser } from '$lib/stores/auth';

	// Live time
	let currentTime = $state('');
	let currentDate = $state('');

	function updateTime() {
		const now = new Date();
		currentTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		currentDate = now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
	}

	// Shift info
	type ShiftSlot = { start_time: string; end_time: string; is_next_day: boolean; total_hours: number; };
	type TodayShift = { type: string; shifts: ShiftSlot[]; total_hours: number; label: string; weekday?: string; } | null;
	let todayShift = $state<TodayShift>(null);
	let shiftLoading = $state(true);

	let userId = $state('');
	teamUser.subscribe(u => { userId = u?.user_id || ''; });

	async function loadTodayShift() {
		if (!userId) { shiftLoading = false; return; }
		shiftLoading = true;
		const { data, error } = await supabase.rpc('rpc_get_today_shift', { p_user_id: userId });
		shiftLoading = false;
		if (!error && data?.success) {
			todayShift = data.data;
		}
	}

	onMount(() => {
		updateTime();
		const timer = setInterval(updateTime, 1000);
		loadTodayShift();
		return () => clearInterval(timer);
	});
</script>

<div class="mobile-home">
	<!-- Info Cards -->
	<div class="info-cards">
		<div class="info-card time-card">
			<div class="info-time">{currentTime}</div>
			<div class="info-date">{currentDate}</div>
		</div>
		<div class="info-card shift-card">
			{#if shiftLoading}
				<div class="shift-loading">Loading...</div>
			{:else if todayShift && todayShift.shifts}
				<div class="shift-label">Today's Shift</div>
				<div class="shift-times">
					{#each todayShift.shifts as s, i}
						{#if i > 0}<span class="shift-divider">|</span>{/if}
						<span class="shift-slot">{s.start_time} – {s.end_time}{#if s.is_next_day}<span class="nd">+1</span>{/if}</span>
					{/each}
				</div>
			{:else}
				<div class="shift-none">No shift assigned</div>
			{/if}
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="btn-grid">
		<a href="/team/mobile/clock" class="grid-btn">
			<span class="grid-icon">⏰</span>
			<span class="grid-label">Clock In / Out</span>
		</a>
	</div>
</div>

<style>
	.mobile-home {
		padding: 12px;
		height: 100%;
		overflow-y: auto;
		box-sizing: border-box;
	}

	/* Info Cards */
	.info-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 16px;
	}
	.info-card {
		padding: 16px;
		border-radius: 12px;
		background: white;
		border: 1px solid #e8e8e8;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
	}
	.time-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
	}
	.info-time {
		font-size: 20px;
		font-weight: 700;
		color: #0E5A3C;
		font-variant-numeric: tabular-nums;
	}
	.info-date {
		font-size: 11px;
		color: #666;
		text-align: center;
	}
	.shift-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
	}
	.shift-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
	}
	.shift-times {
		font-size: 12px;
		font-weight: 600;
		color: #2b2b2b;
		text-align: center;
	}
	.shift-slot {
		white-space: nowrap;
	}
	.shift-divider {
		color: #ccc;
		margin: 0 3px;
	}
	.nd {
		font-size: 9px;
		background: #fef3c7;
		color: #92400e;
		padding: 0 3px;
		border-radius: 3px;
		margin-left: 2px;
		font-weight: 600;
	}
	.shift-total {
		font-size: 11px;
		font-weight: 600;
		color: #0E5A3C;
	}
	.shift-none {
		font-size: 12px;
		color: #999;
		font-style: italic;
	}
	.shift-loading {
		font-size: 12px;
		color: #aaa;
	}

	/* Button Grid */
	.btn-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.grid-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px 12px;
		background: white;
		border-radius: 12px;
		border: 1px solid #e8e8e8;
		text-decoration: none;
		color: #2b2b2b;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
		transition: all 0.2s;
	}
	.grid-btn:hover {
		border-color: #0E5A3C;
		box-shadow: 0 4px 12px rgba(14, 90, 60, 0.1);
		transform: translateY(-1px);
	}
	.grid-btn:active {
		transform: translateY(0);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}
	.grid-icon {
		font-size: 28px;
	}
	.grid-label {
		font-size: 13px;
		font-weight: 600;
		text-align: center;
	}
</style>
