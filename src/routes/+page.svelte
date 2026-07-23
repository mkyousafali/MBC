<script lang="ts">
	import TeamLoginPanel from '$lib/components/public/TeamLoginPanel.svelte';

	let showTeamLogin = $state(false);
</script>

<svelte:head>
	<title>Malabar Biriyani Center — Coming Soon</title>
</svelte:head>

<div class="coming-soon-page">
	<!-- Top Bar -->
	<header class="top-bar">
		<a href="/" class="logo-area">
			<img src="/Logo.png" alt="Malabar Biriyani Center" class="logo-img" />
			<span class="brand-name">Malabar Biriyani Center</span>
		</a>
		<button class="btn-team" onclick={() => showTeamLogin = true}>
			🔐 Team Login
		</button>
	</header>

	<!-- Main Content -->
	<main class="hero">
		<img src="/Logo.png" alt="Malabar Biriyani Center" class="hero-logo" />
		<h1>Malabar Biriyani Center</h1>
		<p class="tagline">Crafted with Heritage, Served with Pride</p>
		<a href="mailto:info@malabarbiriyanicenter.com" class="email-link">
			✉️ info@malabarbiriyanicenter.com
		</a>
		<div class="divider"></div>
	</main>
</div>

<TeamLoginPanel bind:open={showTeamLogin} />

<style>
	.coming-soon-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: linear-gradient(160deg, #F8F8F5 0%, #e8f0e8 50%, #F8F8F5 100%);
	}

	/* Top Bar */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 24px;
		background: white;
		border-bottom: 1px solid #E8E8E8;
		box-shadow: 0 1px 4px rgba(0,0,0,0.04);
	}
	.logo-area {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
	}
	.logo-img {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		object-fit: contain;
	}
	.brand-name {
		font-size: 16px;
		font-weight: 800;
		color: #0E5A3C;
		letter-spacing: -0.3px;
	}
	.email-link {
		font-size: 14px;
		color: #777;
		font-weight: 500;
		text-decoration: none;
		margin-top: 4px;
		transition: color 0.2s;
	}
	.email-link:hover {
		color: #0E5A3C;
		text-decoration: underline;
	}

	/* Hero */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 40px 24px;
		gap: 6px;
	}
	.hero-logo {
		width: 100px;
		height: 100px;
		border-radius: 20px;
		object-fit: contain;
		margin-bottom: 12px;
		box-shadow: 0 4px 20px rgba(14, 90, 60, 0.15);
	}
	.hero h1 {
		font-size: 28px;
		font-weight: 900;
		color: #0E5A3C;
		margin: 0;
		letter-spacing: -0.5px;
	}
	.tagline {
		font-size: 15px;
		color: #C9A24D;
		font-weight: 600;
		margin: 0;
		letter-spacing: 1px;
		text-transform: uppercase;
	}
	.divider {
		width: 60px;
		height: 3px;
		background: linear-gradient(90deg, #0E5A3C, #C9A24D);
		border-radius: 3px;
		margin: 20px 0;
	}
	.coming-soon {
		font-size: 36px;
		font-weight: 900;
		color: #2B2B2B;
		margin: 0;
		letter-spacing: -0.5px;
	}
	.subtitle {
		font-size: 16px;
		color: #777;
		margin: 0 0 24px;
		max-width: 360px;
		line-height: 1.5;
	}
	.btn-team {
		padding: 8px 18px;
		background: #0E5A3C;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-team:hover { background: #0E5A3C; color: white; }

	@media (max-width: 480px) {
		.brand-name { font-size: 14px; }
		.website-link { font-size: 12px; }
		.hero-logo { width: 80px; height: 80px; }
		.hero h1 { font-size: 22px; }
		.coming-soon { font-size: 28px; }
		.subtitle { font-size: 14px; }
	}
</style>
