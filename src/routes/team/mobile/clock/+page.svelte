<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { teamUser } from '$lib/stores/auth';
	import { get } from 'svelte/store';

	let state: 'loading' | 'no-permission' | 'scanning' | 'scanned' | 'confirming' | 'success' | 'error' = $state('loading');
	let errorMsg = $state('');
	let successMsg = $state('');
	let selectedAction: 'clock_in' | 'clock_out' = $state('clock_in');
	let lastAction: string | null = $state(null);
	let scannedData: { b: string; c: string; w: number; t: number } | null = $state(null);
	let scanner: any = null;
	let scannerContainerId = 'qr-reader';

	onMount(async () => {
		// Check last clock action to suggest next
		const user = get(teamUser);
		if (user) {
			const { data } = await supabase.rpc('rpc_get_last_clock_action', { p_user_id: user.user_id });
			if (data?.success && data.data) {
				lastAction = data.data.action_type;
				selectedAction = data.data.action_type === 'clock_in' ? 'clock_out' : 'clock_in';
			}
		}

		// Start scanner
		await startScanner();
	});

	onDestroy(() => {
		stopScanner();
	});

	async function startScanner() {
		try {
			// Check for camera permission first
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			stream.getTracks().forEach(t => t.stop()); // Release immediately, html5-qrcode will handle it

			state = 'scanning';

			// Dynamically import html5-qrcode
			const { Html5Qrcode } = await import('html5-qrcode');
			
			// Wait for DOM element to be ready
			await new Promise(r => setTimeout(r, 100));

			scanner = new Html5Qrcode(scannerContainerId);
			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				onScanSuccess,
				() => {} // Ignore scan failures (no QR found frames)
			);
		} catch (err: any) {
			if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
				state = 'no-permission';
			} else {
				state = 'error';
				errorMsg = err.message || 'Failed to access camera.';
			}
		}
	}

	function stopScanner() {
		if (scanner) {
			scanner.stop().catch(() => {});
			scanner = null;
		}
	}

	function onScanSuccess(decodedText: string) {
		try {
			const parsed = JSON.parse(decodedText);
			if (parsed.b && parsed.c && parsed.w !== undefined) {
				scannedData = parsed;
				stopScanner();
				state = 'scanned';
			}
		} catch {
			// Not our QR, ignore
		}
	}

	async function confirmClock() {
		if (!scannedData) return;

		state = 'confirming';
		const user = get(teamUser);
		if (!user) {
			state = 'error';
			errorMsg = 'Not logged in.';
			return;
		}

		const { data, error } = await supabase.rpc('rpc_clock_attendance', {
			p_user_id: user.user_id,
			p_branch_id: scannedData.b,
			p_code: scannedData.c,
			p_window_num: scannedData.w,
			p_action_type: selectedAction
		});

		if (error) {
			state = 'error';
			errorMsg = error.message;
			return;
		}

		if (!data?.success) {
			state = 'error';
			errorMsg = data?.message || 'Failed to record attendance.';
			return;
		}

		state = 'success';
		successMsg = selectedAction === 'clock_in' ? 'Clocked In Successfully!' : 'Clocked Out Successfully!';
	}

	function rescan() {
		scannedData = null;
		errorMsg = '';
		startScanner();
	}

	function goHome() {
		window.location.href = '/team/mobile';
	}

	function requestPermission() {
		startScanner();
	}
</script>

<div class="clock-page">
	<!-- Loading -->
	{#if state === 'loading'}
		<div class="center-state">
			<div class="spinner"></div>
			<p>Opening camera...</p>
		</div>

	<!-- No Permission -->
	{:else if state === 'no-permission'}
		<div class="center-state">
			<div class="icon-circle error-icon">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M1 1l22 22"/>
					<path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/>
					<path d="M14.121 14.121A3 3 0 1 0 9.88 9.88"/>
				</svg>
			</div>
			<h2>Camera Access Required</h2>
			<p>Please allow camera access to scan the attendance QR code.</p>
			<button class="primary-btn" onclick={requestPermission}>Try Again</button>
		</div>

	<!-- Scanning -->
	{:else if state === 'scanning'}
		<div class="scanner-area">
			<p class="scan-instruction">Point camera at the Security QR Code</p>
			<div id={scannerContainerId} class="scanner-container"></div>
			<p class="scan-hint">Hold steady until the code is detected</p>
		</div>

	<!-- Scanned - Choose action -->
	{:else if state === 'scanned'}
		<div class="action-area">
			<div class="icon-circle success-icon">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
					<polyline points="22 4 12 14.01 9 11.01"/>
				</svg>
			</div>
			<h2>QR Code Verified</h2>

			<div class="action-selector">
				<button
					class="action-btn {selectedAction === 'clock_in' ? 'active-in' : ''}"
					onclick={() => selectedAction = 'clock_in'}
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
					Clock In
				</button>
				<button
					class="action-btn {selectedAction === 'clock_out' ? 'active-out' : ''}"
					onclick={() => selectedAction = 'clock_out'}
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
					Clock Out
				</button>
			</div>

			{#if lastAction}
				<p class="last-action-hint">
					Last action today: <strong>{lastAction === 'clock_in' ? 'Clock In' : 'Clock Out'}</strong>
				</p>
			{/if}

			<button class="confirm-btn" onclick={confirmClock}>
				Confirm {selectedAction === 'clock_in' ? 'Clock In' : 'Clock Out'}
			</button>

			<button class="secondary-btn" onclick={rescan}>Scan Again</button>
		</div>

	<!-- Confirming -->
	{:else if state === 'confirming'}
		<div class="center-state">
			<div class="spinner"></div>
			<p>Recording attendance...</p>
		</div>

	<!-- Success -->
	{:else if state === 'success'}
		<div class="center-state">
			<div class="icon-circle success-icon">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<polyline points="20 6 9 17 4 12"/>
				</svg>
			</div>
			<h2>{successMsg}</h2>
			<p class="time-stamp">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
			<button class="primary-btn" onclick={goHome}>Back to Home</button>
		</div>

	<!-- Error -->
	{:else if state === 'error'}
		<div class="center-state">
			<div class="icon-circle error-icon">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/>
					<line x1="15" y1="9" x2="9" y2="15"/>
					<line x1="9" y1="9" x2="15" y2="15"/>
				</svg>
			</div>
			<h2>Error</h2>
			<p>{errorMsg}</p>
			<button class="primary-btn" onclick={rescan}>Try Again</button>
			<button class="secondary-btn" onclick={goHome}>Go Home</button>
		</div>
	{/if}
</div>

<style>
	.clock-page {
		min-height: 100vh;
		background: #F8F8F5;
		display: flex;
		flex-direction: column;
	}

	.clock-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		background: #0E5A3C;
		color: white;
	}

	.clock-header h1 {
		font-size: 17px;
		font-weight: 600;
		margin: 0;
	}

	.back-btn {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
	}

	/* Center States */
	.center-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 32px;
		text-align: center;
		gap: 16px;
	}

	.center-state h2 {
		font-size: 20px;
		color: #1a1a1a;
		margin: 0;
	}

	.center-state p {
		color: #666;
		font-size: 14px;
		margin: 0;
	}

	.icon-circle {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.success-icon {
		background: #e6f7ee;
		color: #0E5A3C;
	}

	.error-icon {
		background: #ffe6e6;
		color: #d32f2f;
	}

	/* Scanner */
	.scanner-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 24px 16px;
		gap: 16px;
	}

	.scan-instruction {
		font-size: 15px;
		font-weight: 600;
		color: #333;
		margin: 0;
	}

	.scanner-container {
		width: 100%;
		max-width: 320px;
		border-radius: 12px;
		overflow: hidden;
		border: 3px solid #0E5A3C;
	}

	.scan-hint {
		font-size: 13px;
		color: #888;
		margin: 0;
	}

	/* Action Area */
	.action-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 40px 24px;
		gap: 20px;
		text-align: center;
	}

	.action-area h2 {
		font-size: 20px;
		color: #0E5A3C;
		margin: 0;
	}

	.action-selector {
		display: flex;
		gap: 12px;
		width: 100%;
		max-width: 320px;
	}

	.action-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 14px 16px;
		border-radius: 10px;
		border: 2px solid #ddd;
		background: white;
		font-size: 14px;
		font-weight: 600;
		color: #555;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn.active-in {
		border-color: #0E5A3C;
		background: #e6f7ee;
		color: #0E5A3C;
	}

	.action-btn.active-out {
		border-color: #d32f2f;
		background: #ffe6e6;
		color: #d32f2f;
	}

	.last-action-hint {
		font-size: 13px;
		color: #888;
		margin: 0;
	}

	.confirm-btn {
		width: 100%;
		max-width: 320px;
		padding: 14px;
		border: none;
		border-radius: 10px;
		background: #0E5A3C;
		color: white;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.confirm-btn:active {
		background: #094a30;
	}

	/* Buttons */
	.primary-btn {
		padding: 12px 32px;
		border: none;
		border-radius: 10px;
		background: #0E5A3C;
		color: white;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}

	.primary-btn:active {
		background: #094a30;
	}

	.secondary-btn {
		padding: 10px 24px;
		border: 2px solid #ddd;
		border-radius: 10px;
		background: white;
		color: #555;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.time-stamp {
		font-size: 28px !important;
		font-weight: 700;
		color: #0E5A3C !important;
	}

	/* Spinner */
	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #e0e0e0;
		border-top-color: #0E5A3C;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* html5-qrcode overrides */
	.scanner-container :global(video) {
		border-radius: 8px;
	}

	.scanner-container :global(#qr-shaded-region) {
		border-color: rgba(14, 90, 60, 0.4) !important;
	}
</style>
