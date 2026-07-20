<script lang="ts">
	import Input from '$lib/components/common/Input.svelte';
	import Button from '$lib/components/common/Button.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { toasts } from '$lib/stores/toast';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let activeTab: 'login' | 'register' = $state('login');
	let loginMobile = $state('');
	let loginPassword = $state('');
	let rememberMe = $state(false);
	let regName = $state('');
	let regMobile = $state('');
	let regEmail = $state('');
	let regPassword = $state('');
	let regConfirm = $state('');
	let acceptTerms = $state(false);

	function handleLogin() {
		toasts.add('Demo login successful! Redirecting...', 'success');
		setTimeout(() => { open = false; window.location.href = '/customer'; }, 1000);
	}

	function handleRegister() {
		toasts.add('Demo account created! Welcome to MBC.', 'success');
		setTimeout(() => { open = false; window.location.href = '/customer'; }, 1000);
	}
</script>

<Modal bind:open size="md">
	<div class="auth-panel">
		<div class="auth-header">
			<img src="/Logo.png" alt="MBC" class="auth-logo" />
			<h2>Welcome to MBC</h2>
		</div>

		<div class="tab-switcher" role="tablist">
			<button
				role="tab"
				class:active={activeTab === 'login'}
				aria-selected={activeTab === 'login'}
				onclick={() => activeTab = 'login'}
			>Login</button>
			<button
				role="tab"
				class:active={activeTab === 'register'}
				aria-selected={activeTab === 'register'}
				onclick={() => activeTab = 'register'}
			>Register</button>
		</div>

		{#if activeTab === 'login'}
			<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
				<Input label="Mobile Number" placeholder="+91 98765 43210" bind:value={loginMobile} required id="login-mobile" />
				<Input label="Password / Access Code" type="password" placeholder="Enter password" bind:value={loginPassword} required id="login-password" />
				<div class="form-row">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={rememberMe} />
						<span>Remember me</span>
					</label>
					<button type="button" class="link-btn" onclick={() => toasts.add('Password reset link sent (demo)', 'info')}>Forgot password?</button>
				</div>
				<Button variant="primary" fullWidth type="submit">Login</Button>
			</form>
		{:else}
			<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
				<Input label="Full Name" placeholder="Your full name" bind:value={regName} required id="reg-name" />
				<Input label="Mobile Number" placeholder="+91 98765 43210" bind:value={regMobile} required id="reg-mobile" />
				<Input label="Email (optional)" type="email" placeholder="email@example.com" bind:value={regEmail} id="reg-email" />
				<Input label="Password" type="password" placeholder="Create a password" bind:value={regPassword} required id="reg-password" />
				<Input label="Confirm Password" type="password" placeholder="Confirm password" bind:value={regConfirm} required id="reg-confirm" />
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={acceptTerms} />
					<span>I accept the <a href="/terms">Terms & Conditions</a></span>
				</label>
				<Button variant="primary" fullWidth type="submit">Create Account</Button>
			</form>
		{/if}
	</div>
</Modal>

<style>
	.auth-panel { text-align: center; }
	.auth-header { margin-bottom: var(--space-5); }
	.auth-logo { height: 48px; margin: 0 auto var(--space-3); }
	.auth-header h2 { font-size: var(--font-size-xl); color: var(--color-primary-dark); }
	.tab-switcher {
		display: flex;
		background: var(--color-bg-alt);
		border-radius: var(--radius-md);
		padding: 3px;
		margin-bottom: var(--space-6);
	}
	.tab-switcher button {
		flex: 1;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}
	.tab-switcher button.active {
		background: var(--color-white);
		color: var(--color-primary);
		box-shadow: var(--shadow-xs);
	}
	.auth-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		text-align: left;
	}
	.form-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.checkbox-label input { accent-color: var(--color-primary); width: 16px; height: 16px; }
	.checkbox-label a { color: var(--color-primary); }
	.link-btn {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		background: none;
		border: none;
		cursor: pointer;
	}
	.link-btn:hover { text-decoration: underline; }
</style>
