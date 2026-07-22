<script lang="ts">
	import Input from '$lib/components/common/Input.svelte';
	import Button from '$lib/components/common/Button.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { toasts } from '$lib/stores/toast';
	import { setTeamUser, setPermissions } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';
	import { writeAuditLog } from '$lib/utils/audit';

	let { open = $bindable(false) }: { open: boolean } = $props();

	// Login mode: 'qac' = Quick Access, 'username' = Username & Password
	let loginMode = $state<'qac' | 'username'>('qac');

	// Username login fields
	let username = $state('');
	let password = $state('');
	let loginLoading = $state(false);

	// Quick Access Code fields — 6 individual digits
	let qacDigits = $state<string[]>(['', '', '', '', '', '']);
	let qacInputs = $state<HTMLInputElement[]>([]);

	// Super admin secret access
	let logoClickCount = $state(0);
	let superAdminOpen = $state(false);
	let superAdminUser = $state('');
	let superAdminPass = $state('');
	let superAdminLoading = $state(false);
	let clickTimer: ReturnType<typeof setTimeout> | null = null;

	function isMobile(): boolean {
		return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) || window.innerWidth < 768;
	}

	function resetForm() {
		username = '';
		password = '';
		qacDigits = ['', '', '', '', '', ''];
		loginLoading = false;
	}

	function switchMode(mode: 'qac' | 'username') {
		loginMode = mode;
		resetForm();
	}

	function handleLogoClick() {
		if (isMobile()) return;
		logoClickCount++;
		if (clickTimer) clearTimeout(clickTimer);
		clickTimer = setTimeout(() => { logoClickCount = 0; }, 3000);
		if (logoClickCount >= 10) {
			logoClickCount = 0;
			open = false;
			superAdminOpen = true;
		}
	}

	async function hashText(text: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(text);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	}

	async function loadPermissions(userId: string) {
		try {
			const { data } = await supabase.rpc('rpc_get_my_permissions', { p_user_id: userId });
			setPermissions(data || []);
		} catch { setPermissions([]); }
	}

	function handleLoginSuccess(data: any) {
		setTeamUser({
			user_id: data.user_id,
			full_name: data.full_name,
			username: data.username,
			employee_code: data.employee_code || '',
			job_title: data.job_title || '',
			department: data.department || '',
			branch_name: data.branch_name || '',
			is_super_admin: false
		});
		loadPermissions(data.user_id);
		writeAuditLog({ action: 'login', resourceType: 'session', resourceLabel: data.full_name, details: { method: 'credentials' } });
		toasts.add(`Welcome, ${data.full_name}!`, 'success');
		setTimeout(() => {
			open = false;
			window.location.href = isMobile() ? '/team/mobile' : '/team/desktop';
		}, 1000);
	}

	// --- Username + Password Login ---
	async function handleUsernameLogin() {
		if (!username.trim() || !password.trim()) {
			toasts.add('Please enter username and password', 'error');
			return;
		}
		loginLoading = true;
		try {
			const passwordHash = await hashText(password);
			const { data, error } = await supabase.rpc('rpc_team_login_username', {
				p_username: username.trim(),
				p_password_hash: passwordHash
			});
			if (error) throw error;
			if (data?.success) {
				handleLoginSuccess(data);
			} else {
				toasts.add(data?.message || 'Invalid credentials', 'error');
			}
		} catch (e: any) {
			toasts.add('Login failed: ' + (e.message || 'Unknown error'), 'error');
		} finally {
			loginLoading = false;
		}
	}

	// --- Quick Access Code Login ---
	async function handleQACLogin() {
		const code = qacDigits.join('');
		if (code.length !== 6 || !/^\d{6}$/.test(code)) {
			toasts.add('Please enter all 6 digits', 'error');
			return;
		}
		loginLoading = true;
		try {
			const codeHash = await hashText(code);
			const { data, error } = await supabase.rpc('rpc_team_login_qac', {
				p_qac_hash: codeHash
			});
			if (error) throw error;
			if (data?.success) {
				handleLoginSuccess(data);
			} else {
				toasts.add(data?.message || 'Invalid access code', 'error');
				qacDigits = ['', '', '', '', '', ''];
				qacInputs[0]?.focus();
			}
		} catch (e: any) {
			toasts.add('Login failed: ' + (e.message || 'Unknown error'), 'error');
		} finally {
			loginLoading = false;
		}
	}

	function handleQACInput(index: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const val = input.value.replace(/\D/g, '');
		qacDigits[index] = val.slice(-1);
		input.value = qacDigits[index];

		// Auto-advance to next input
		if (val && index < 5) {
			qacInputs[index + 1]?.focus();
		}

		// Auto-submit when all 6 filled
		if (qacDigits.every(d => d !== '')) {
			handleQACLogin();
		}
	}

	function handleQACKeydown(index: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !qacDigits[index] && index > 0) {
			qacDigits[index - 1] = '';
			qacInputs[index - 1]?.focus();
		}
	}

	function handleQACPaste(e: ClipboardEvent) {
		e.preventDefault();
		const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
		if (pasted.length === 6) {
			qacDigits = pasted.split('');
			qacInputs[5]?.focus();
			handleQACLogin();
		}
	}

	async function handleSuperAdminLogin() {
		if (!superAdminUser.trim() || !superAdminPass.trim()) {
			toasts.add('Please enter username and password', 'error');
			return;
		}
		superAdminLoading = true;
		try {
			const passwordHash = await hashText(superAdminPass);
			const { data, error } = await supabase.rpc('verify_super_admin', {
				p_username: superAdminUser.trim(),
				p_password_hash: passwordHash
			});
			if (error) throw error;
			if (data?.success) {
				setTeamUser({
					user_id: '',
					full_name: 'Super Admin',
					username: superAdminUser.trim(),
					employee_code: '',
					job_title: 'Super Admin',
					department: '',
					branch_name: '',
					is_super_admin: true
				});
				setPermissions([]);
				writeAuditLog({ action: 'login', resourceType: 'session', resourceLabel: 'Super Admin', details: { method: 'super_admin' } });
				toasts.add('Super Admin access granted!', 'success');
				setTimeout(() => {
					superAdminOpen = false;
					window.location.href = '/team/desktop';
				}, 1000);
			} else {
				toasts.add('Invalid credentials', 'error');
			}
		} catch (e: any) {
			toasts.add('Login failed: ' + (e.message || 'Unknown error'), 'error');
		} finally {
			superAdminLoading = false;
		}
	}
</script>

<Modal bind:open size="sm" title="Team Login">
	<div class="team-login">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="team-logo" onclick={handleLogoClick}>
			<img src="/App Logo.png" alt="MBC One OS" class="app-logo" />
			<span class="app-name">MBC One OS</span>
		</div>

		<!-- Login Mode Switch -->
		<div class="mode-switch">
			<button
				class="mode-btn"
				class:active={loginMode === 'qac'}
				onclick={() => switchMode('qac')}
			>
				⚡ Quick Access
			</button>
			<button
				class="mode-btn"
				class:active={loginMode === 'username'}
				onclick={() => switchMode('username')}
			>
				👤 Username Login
			</button>
		</div>

		<!-- Quick Access Code Login -->
		{#if loginMode === 'qac'}
			<form class="team-form" onsubmit={(e) => { e.preventDefault(); handleQACLogin(); }}>
				<p class="qac-hint">Enter your 6-digit quick access code</p>
				<div class="qac-inputs" onpaste={handleQACPaste}>
					{#each qacDigits as digit, i}
						<input
							class="qac-digit"
							type="text"
							inputmode="numeric"
							maxlength={1}
							value={digit}
							bind:this={qacInputs[i]}
							oninput={(e) => handleQACInput(i, e)}
							onkeydown={(e) => handleQACKeydown(i, e)}
						/>
					{/each}
				</div>
				<Button variant="primary" fullWidth type="submit" disabled={loginLoading}>
					{loginLoading ? 'Verifying...' : 'Login'}
				</Button>
			</form>

		<!-- Username & Password Login -->
		{:else}
			<form class="team-form" onsubmit={(e) => { e.preventDefault(); handleUsernameLogin(); }}>
				<Input label="Username" placeholder="Enter your username" bind:value={username} required id="team-username" />
				<Input label="Password" type="password" placeholder="Enter your password" bind:value={password} required id="team-password" />
				<Button variant="primary" fullWidth type="submit" disabled={loginLoading}>
					{loginLoading ? 'Verifying...' : 'Login'}
				</Button>
			</form>
		{/if}
	</div>
</Modal>

<Modal bind:open={superAdminOpen} size="sm" title="Super Admin">
	<div class="team-login">
		<div class="super-admin-icon">🔐</div>
		<form class="team-form" onsubmit={(e) => { e.preventDefault(); handleSuperAdminLogin(); }}>
			<Input label="Username" placeholder="Enter admin username" bind:value={superAdminUser} required id="sa-user" />
			<Input label="Password" type="password" placeholder="Enter admin password" bind:value={superAdminPass} required id="sa-pass" />
			<Button variant="primary" fullWidth type="submit" disabled={superAdminLoading}>
				{superAdminLoading ? 'Verifying...' : 'Login as Super Admin'}
			</Button>
		</form>
	</div>
</Modal>

<style>
	.team-login { text-align: center; }
	.team-logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
		cursor: default;
		user-select: none;
		-webkit-user-select: none;
	}
	.app-logo { height: 56px; width: auto; }
	.app-name {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-weight: var(--font-weight-medium);
	}

	/* Mode Switch */
	.mode-switch {
		display: flex;
		background: var(--color-bg-alt);
		border-radius: var(--radius-md);
		padding: 3px;
		margin-bottom: var(--space-5);
		gap: 3px;
	}
	.mode-btn {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border-radius: calc(var(--radius-md) - 2px);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		background: transparent;
		transition: all var(--transition-fast);
		cursor: pointer;
		border: none;
		white-space: nowrap;
	}
	.mode-btn.active {
		background: var(--color-white);
		color: var(--color-primary);
		box-shadow: var(--shadow-sm);
		font-weight: var(--font-weight-semibold);
	}
	.mode-btn:not(.active):hover {
		color: var(--color-text);
	}

	/* QAC Inputs */
	.qac-hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}
	.qac-inputs {
		display: flex;
		justify-content: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.qac-digit {
		width: 48px;
		height: 56px;
		text-align: center;
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-white);
		color: var(--color-text);
		transition: border-color var(--transition-fast);
		caret-color: var(--color-primary);
	}
	.qac-digit:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px var(--color-primary-50);
	}

	.team-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		text-align: left;
	}

	.super-admin-icon {
		font-size: 3rem;
		margin-bottom: var(--space-4);
	}

	/* Mobile responsive QAC */
	@media (max-width: 400px) {
		.qac-digit {
			width: 40px;
			height: 48px;
			font-size: var(--font-size-xl);
		}
		.qac-inputs { gap: 6px; }
	}
</style>
