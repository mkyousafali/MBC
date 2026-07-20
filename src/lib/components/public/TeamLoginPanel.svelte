<script lang="ts">
	import Input from '$lib/components/common/Input.svelte';
	import Button from '$lib/components/common/Button.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { toasts } from '$lib/stores/toast';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let employeeId = $state('');
	let password = $state('');
	let rememberDevice = $state(false);
	let workspace: 'desktop' | 'mobile' = $state('desktop');

	function handleTeamLogin() {
		toasts.add('Team login successful! Redirecting...', 'success');
		setTimeout(() => {
			open = false;
			window.location.href = workspace === 'desktop' ? '/team/desktop' : '/team/mobile';
		}, 1000);
	}
</script>

<Modal bind:open size="sm" title="Team Login">
	<div class="team-login">
		<div class="team-logo">
			<img src="/App Logo.png" alt="MBC One OS" class="app-logo" />
			<span class="app-name">MBC One OS</span>
		</div>

		<form class="team-form" onsubmit={(e) => { e.preventDefault(); handleTeamLogin(); }}>
			<Input label="Employee ID / Email / Mobile" placeholder="Enter your credentials" bind:value={employeeId} required id="team-id" />
			<Input label="Password / Access Code" type="password" placeholder="Enter password" bind:value={password} required id="team-password" />

			<div class="workspace-selector">
				<span class="selector-label">Workspace</span>
				<div class="selector-options" role="radiogroup" aria-label="Workspace selection">
					<button
						type="button"
						class="selector-btn"
						class:active={workspace === 'desktop'}
						role="radio"
						aria-checked={workspace === 'desktop'}
						onclick={() => workspace = 'desktop'}
					>
						<span class="selector-icon">🖥️</span>
						<span>Desktop</span>
					</button>
					<button
						type="button"
						class="selector-btn"
						class:active={workspace === 'mobile'}
						role="radio"
						aria-checked={workspace === 'mobile'}
						onclick={() => workspace = 'mobile'}
					>
						<span class="selector-icon">📱</span>
						<span>Mobile</span>
					</button>
				</div>
			</div>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={rememberDevice} />
				<span>Remember this device</span>
			</label>

			<Button variant="primary" fullWidth type="submit">Login to Workspace</Button>
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
		margin-bottom: var(--space-6);
	}
	.app-logo { height: 56px; width: auto; }
	.app-name {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-weight: var(--font-weight-medium);
	}
	.team-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		text-align: left;
	}
	.workspace-selector { display: flex; flex-direction: column; gap: var(--space-2); }
	.selector-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}
	.selector-options { display: flex; gap: var(--space-3); }
	.selector-btn {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-4);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		transition: all var(--transition-fast);
		background: var(--color-white);
		color: var(--color-text-secondary);
	}
	.selector-btn.active {
		border-color: var(--color-primary);
		background: var(--color-primary-50);
		color: var(--color-primary);
	}
	.selector-btn:hover:not(.active) { border-color: var(--color-text-light); }
	.selector-icon { font-size: 1.5rem; }
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.checkbox-label input { accent-color: var(--color-primary); width: 16px; height: 16px; }
</style>
