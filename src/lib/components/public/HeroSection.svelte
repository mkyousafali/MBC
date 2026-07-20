<script lang="ts">
	let { onLoginClick }: { onLoginClick: () => void } = $props();
</script>

<section class="hero" id="home">
	<div class="hero-container">
		<div class="hero-content">
			<h1>Authentic Malabar Taste, Made Memorable</h1>
			<p class="hero-subtitle">Discover signature biriyani, special offers and a smoother ordering experience from Malabar Biriyani Center.</p>
			<div class="hero-actions">
				<button class="hero-btn-primary" onclick={onLoginClick}>Login / Register</button>
				<a href="#menu" class="hero-btn-secondary">Explore Menu</a>
			</div>
		</div>
		<div class="hero-visual">
			<div class="hero-image-area">
				<span class="hero-food-emoji">🍛</span>
				<img src="/Logo.png" alt="Malabar Biriyani Center" class="hero-logo" />
			</div>
		</div>
	</div>
</section>

<style>
	.hero {
		background: linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-white) 50%, #FFF8E1 100%);
		padding: var(--space-16) var(--space-5);
		overflow: hidden;
	}
	.hero-container {
		max-width: var(--max-width);
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-10);
		align-items: center;
	}
	.hero-content { max-width: 560px; }
	h1 {
		font-size: var(--font-size-4xl);
		color: var(--color-primary-dark);
		margin-bottom: var(--space-5);
		line-height: 1.2;
	}
	.hero-subtitle {
		font-size: var(--font-size-lg);
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
		margin-bottom: var(--space-8);
	}
	.hero-actions { display: flex; gap: var(--space-4); flex-wrap: wrap; }
	.hero-btn-primary {
		padding: var(--space-4) var(--space-8);
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-md);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		transition: background var(--transition-fast);
	}
	.hero-btn-primary:hover { background: var(--color-primary-light); }
	.hero-btn-secondary {
		padding: var(--space-4) var(--space-8);
		border: 2px solid var(--color-primary);
		color: var(--color-primary);
		border-radius: var(--radius-md);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		transition: all var(--transition-fast);
		display: inline-flex;
		align-items: center;
	}
	.hero-btn-secondary:hover { background: var(--color-primary-50); }
	.hero-visual { display: flex; justify-content: center; }
	.hero-image-area {
		width: 380px;
		height: 380px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary-50), #FFF8E1);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		box-shadow: var(--shadow-lg);
		position: relative;
	}
	.hero-food-emoji { font-size: 6rem; }
	.hero-logo { width: 100px; opacity: 0.9; }

	@media (max-width: 768px) {
		.hero { padding: var(--space-10) var(--space-4); }
		.hero-container { grid-template-columns: 1fr; text-align: center; }
		.hero-content { max-width: 100%; }
		h1 { font-size: var(--font-size-3xl); }
		.hero-actions { justify-content: center; }
		.hero-visual { order: -1; }
		.hero-image-area { width: 240px; height: 240px; }
		.hero-food-emoji { font-size: 4rem; }
		.hero-logo { width: 60px; }
	}
</style>
