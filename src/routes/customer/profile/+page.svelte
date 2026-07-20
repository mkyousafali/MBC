<script lang="ts">
	import { currentCustomer } from '$lib/data/demo';
	import Button from '$lib/components/common/Button.svelte';
	import { toasts } from '$lib/stores/toast';
</script>

<div class="profile-page">
	<div class="profile-header">
		<div class="avatar">{currentCustomer.name.charAt(0)}</div>
		<h1>{currentCustomer.name}</h1>
		<p class="profile-mobile">{currentCustomer.mobile}</p>
		{#if currentCustomer.email}
			<p class="profile-email">{currentCustomer.email}</p>
		{/if}
	</div>

	<div class="profile-sections">
		<div class="profile-card">
			<h3>⭐ Loyalty Points</h3>
			<div class="loyalty-display">
				<span class="points-value">{currentCustomer.loyaltyPoints}</span>
				<span class="points-label">Points Available</span>
			</div>
		</div>

		<div class="profile-card">
			<h3>📍 Saved Addresses</h3>
			<div class="addresses-list">
				{#each currentCustomer.addresses as addr (addr.id)}
					<div class="address-item">
						<div class="address-info">
							<span class="address-label">{addr.label}{#if addr.isDefault} (Default){/if}</span>
							<span class="address-text">{addr.address}</span>
						</div>
					</div>
				{/each}
			</div>
			<Button variant="outline" size="sm" onclick={() => toasts.add('Add address feature coming soon', 'info')}>+ Add Address</Button>
		</div>

		<div class="profile-card">
			<h3>⚙️ Account Settings</h3>
			<div class="settings-list">
				<button class="settings-item" onclick={() => toasts.add('Edit profile coming soon', 'info')}>Edit Profile →</button>
				<button class="settings-item" onclick={() => toasts.add('Change password coming soon', 'info')}>Change Password →</button>
				<button class="settings-item" onclick={() => toasts.add('Notification settings coming soon', 'info')}>Notifications →</button>
			</div>
		</div>

		<Button variant="danger" fullWidth onclick={() => toasts.add('Logged out (demo)', 'info')}>Logout</Button>
	</div>
</div>

<style>
	.profile-page { padding: var(--space-5); }
	.profile-header {
		text-align: center; padding: var(--space-8) 0 var(--space-6);
	}
	.avatar {
		width: 72px; height: 72px;
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: white; font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		display: flex; align-items: center; justify-content: center;
		margin: 0 auto var(--space-3);
	}
	h1 { font-size: var(--font-size-2xl); }
	.profile-mobile { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
	.profile-email { color: var(--color-text-light); font-size: var(--font-size-sm); }
	.profile-sections { display: flex; flex-direction: column; gap: var(--space-4); }
	.profile-card {
		background: var(--color-white); border-radius: var(--radius-lg);
		padding: var(--space-5); box-shadow: var(--shadow-xs);
	}
	.profile-card h3 { font-size: var(--font-size-base); margin-bottom: var(--space-4); }
	.loyalty-display { text-align: center; padding: var(--space-4); }
	.points-value {
		display: block; font-size: var(--font-size-4xl);
		font-weight: var(--font-weight-bold); color: var(--color-accent);
	}
	.points-label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
	.addresses-list { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-3); }
	.address-item {
		padding: var(--space-3); background: var(--color-bg);
		border-radius: var(--radius-md);
	}
	.address-label { font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm); display: block; }
	.address-text { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
	.settings-list { display: flex; flex-direction: column; }
	.settings-item {
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border-light);
		font-size: var(--font-size-sm); color: var(--color-text);
		text-align: left; transition: color var(--transition-fast);
	}
	.settings-item:hover { color: var(--color-primary); }
	.settings-item:last-child { border-bottom: none; }
</style>
