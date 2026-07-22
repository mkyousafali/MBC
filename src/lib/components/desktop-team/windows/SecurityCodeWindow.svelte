<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { toasts } from '$lib/stores/toast';
	import { teamUser, userPermissions } from '$lib/stores/auth';
	import { writeAuditLog } from '$lib/utils/audit';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';

	// Permission system
	const RESOURCE_KEY = 'hr.operations.security_code';
	let isSA = $state(false);
	let permAdd = $state(false);
	let permEdit = $state(false);
	teamUser.subscribe(u => { isSA = u?.is_super_admin === true; });
	userPermissions.subscribe(p => {
		const r = p.find((x: any) => x.resource_key === RESOURCE_KEY);
		permAdd = isSA || (r?.can_add ?? false);
		permEdit = isSA || (r?.can_edit ?? false);
	});

	let loading = $state(true);
	let branchId = $state('');
	let branchName = $state('');
	let secret = $state('');
	let currentCode = $state('');
	let qrDataUrl = $state('');
	let timeLeft = $state(5);
	let regenerating = $state(false);

	let interval: ReturnType<typeof setInterval> | null = null;
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	async function loadSecret() {
		loading = true;
		const { data, error } = await supabase.rpc('rpc_get_qr_secret');
		loading = false;
		if (error) { toasts.add('Failed to load: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
		branchId = data.branch_id;
		branchName = data.branch_name;
		secret = data.secret;
		await generateCode();
	}

	async function generateCode() {
		if (!secret) return;
		const windowNum = Math.floor(Date.now() / 5000);
		const code = await computeCode(secret, windowNum);
		currentCode = code;

		// Generate QR with branch_id + code + window for verification
		const qrPayload = JSON.stringify({
			b: branchId,
			c: code,
			w: windowNum,
			t: Date.now()
		});

		try {
			qrDataUrl = await QRCode.toDataURL(qrPayload, {
				width: 320,
				margin: 2,
				color: { dark: '#0E5A3C', light: '#FFFFFF' },
				errorCorrectionLevel: 'M'
			});
		} catch (e) {
			console.error('QR generation failed', e);
		}
	}

	async function computeCode(secretStr: string, windowNum: number): Promise<string> {
		const input = secretStr + windowNum.toString();
		const encoder = new TextEncoder();
		const data = encoder.encode(input);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hexStr = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		return hexStr.slice(0, 8).toUpperCase();
	}

	function startTimers() {
		let lastWindowNum = -1;

		const tick = async () => {
			const now = Date.now();
			const windowNum = Math.floor(now / 5000);
			const nextWindow = (windowNum + 1) * 5000;
			timeLeft = Math.ceil((nextWindow - now) / 1000);

			// Only regenerate code when entering a new 5-second window
			if (windowNum !== lastWindowNum) {
				lastWindowNum = windowNum;
				await generateCode();
			}
		};

		tick();
		interval = setInterval(tick, 1000);
	}

	function stopTimers() {
		if (interval) { clearInterval(interval); interval = null; }
		if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
	}

	async function handleRegenerate() {
		if (!confirm('Regenerate the security secret? All previously generated codes will become invalid.')) return;
		regenerating = true;
		const { data, error } = await supabase.rpc('rpc_regenerate_qr_secret', { p_branch_id: branchId });
		regenerating = false;
		if (error) { toasts.add('Failed: ' + error.message, 'error'); return; }
		if (!data?.success) { toasts.add(data?.message || 'Failed', 'error'); return; }
		secret = data.new_secret;
		toasts.add('Security secret regenerated', 'success');
		writeAuditLog({
			action: 'update',
			resourceType: 'security_code',
			resourceId: branchId,
			resourceLabel: branchName,
			changes: [{ field: 'qr_secret', from: '(hidden)', to: '(regenerated)' }]
		});
		await generateCode();
	}

	onMount(() => {
		loadSecret().then(() => startTimers());
		return () => stopTimers();
	});
</script>

<div class="security-window">
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading security code...</p>
		</div>
	{:else if !secret}
		<div class="error-state">
			<div class="error-icon">⚠️</div>
			<h3>No Branch Found</h3>
			<p>No active branch is configured. Please set up a branch first.</p>
		</div>
	{:else}
		<div class="qr-container">
			<div class="qr-header">
				<div class="branch-badge">
					<span class="branch-icon">🏪</span>
					<span class="branch-name">{branchName}</span>
				</div>
				<div class="code-label">Attendance Security Code</div>
			</div>

			<div class="qr-display">
				{#if qrDataUrl}
					<img src={qrDataUrl} alt="Security QR Code" class="qr-image" />
				{/if}
				<div class="code-text">{currentCode}</div>
			</div>

			<div class="timer-bar">
				<div class="timer-fill" style="width: {(timeLeft / 5) * 100}%"></div>
			</div>
			<div class="timer-text">Refreshes in <strong>{timeLeft}s</strong></div>

			<div class="instructions">
				<p>📱 Employees scan this QR code with their phone to register attendance.</p>
				<p>🔄 Code changes every 5 seconds for security.</p>
			</div>

			{#if permEdit}
				<div class="actions-bar">
					<button class="btn-regenerate" onclick={handleRegenerate} disabled={regenerating}>
						{regenerating ? 'Regenerating...' : '🔄 Regenerate Secret'}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.security-window {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		height: 100%; padding: 24px; background: linear-gradient(135deg, #f0fdf4 0%, #f8f8f5 100%);
	}

	.loading-state, .error-state {
		display: flex; flex-direction: column; align-items: center; gap: 16px; color: #666;
	}
	.spinner {
		width: 40px; height: 40px; border: 3px solid #e0e0e0; border-top-color: #0E5A3C;
		border-radius: 50%; animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.error-icon { font-size: 48px; }
	.error-state h3 { margin: 0; font-size: 18px; color: #2b2b2b; }
	.error-state p { margin: 0; font-size: 14px; color: #666; text-align: center; }

	.qr-container {
		display: flex; flex-direction: column; align-items: center; gap: 20px;
		background: white; padding: 32px; border-radius: 16px;
		box-shadow: 0 8px 32px rgba(14, 90, 60, 0.1);
		border: 1px solid rgba(14, 90, 60, 0.1);
		max-width: 420px; width: 100%;
	}

	.qr-header { display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.branch-badge {
		display: flex; align-items: center; gap: 8px;
		padding: 6px 14px; border-radius: 20px;
		background: rgba(14, 90, 60, 0.08); border: 1px solid rgba(14, 90, 60, 0.15);
	}
	.branch-icon { font-size: 16px; }
	.branch-name { font-size: 13px; font-weight: 600; color: #0E5A3C; }
	.code-label { font-size: 18px; font-weight: 700; color: #2b2b2b; letter-spacing: -0.3px; }

	.qr-display {
		display: flex; flex-direction: column; align-items: center; gap: 12px;
		padding: 16px; border-radius: 12px;
		background: #fafafa; border: 2px solid #e8e8e8;
	}
	.qr-image { width: 240px; height: 240px; border-radius: 8px; }
	.code-text {
		font-family: 'Courier New', monospace; font-size: 28px; font-weight: 700;
		letter-spacing: 4px; color: #0E5A3C;
		padding: 6px 16px; background: #f0fdf4; border-radius: 6px;
		border: 1px solid #bbf7d0;
	}

	.timer-bar {
		width: 100%; height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden;
	}
	.timer-fill {
		height: 100%; background: linear-gradient(90deg, #0E5A3C, #16a34a);
		border-radius: 2px; transition: width 1s linear;
	}
	.timer-text { font-size: 12px; color: #888; }
	.timer-text strong { color: #0E5A3C; }

	.instructions {
		display: flex; flex-direction: column; gap: 4px;
		padding: 12px 16px; border-radius: 8px;
		background: #fffbeb; border: 1px solid #fde68a;
		width: 100%;
	}
	.instructions p { margin: 0; font-size: 12px; color: #92400e; line-height: 1.4; }

	.actions-bar { width: 100%; display: flex; justify-content: center; padding-top: 8px; }
	.btn-regenerate {
		padding: 8px 18px; border: 1px solid #ddd; border-radius: 6px;
		background: white; font-size: 12px; font-weight: 500; cursor: pointer;
		color: #666; transition: all 0.2s;
	}
	.btn-regenerate:hover { border-color: #c0392b; color: #c0392b; background: #fff5f5; }
	.btn-regenerate:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
