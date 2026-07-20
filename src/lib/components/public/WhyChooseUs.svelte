<section class="why-section">
	<div class="section-container">
		<h2>Why Choose Us</h2>
		<p class="section-subtitle">What makes Malabar Biriyani Center special</p>
		<div class="benefits-grid">
			<div class="benefit-card">
				<span class="benefit-icon">🍛</span>
				<h3>Authentic Taste</h3>
				<p>Traditional Malabar recipes passed down through generations, prepared with love and care.</p>
			</div>
			<div class="benefit-card">
				<span class="benefit-icon">🌿</span>
				<h3>Quality Ingredients</h3>
				<p>Fresh, locally sourced ingredients and premium spices for every dish we serve.</p>
			</div>
			<div class="benefit-card">
				<span class="benefit-icon">⚡</span>
				<h3>Fast Service</h3>
				<p>Quick preparation without compromising quality — your meal, fresh and on time.</p>
			</div>
			<div class="benefit-card">
				<span class="benefit-icon">❤️</span>
				<h3>Customer Satisfaction</h3>
				<p>Your happiness is our priority. Every meal is made to delight and satisfy.</p>
			</div>
		</div>
	</div>
</section>

<style>
	.why-section {
		padding: var(--space-16) var(--space-5);
		background: var(--color-white);
	}
	.section-container { max-width: var(--max-width); margin: 0 auto; }
	h2 { text-align: center; font-size: var(--font-size-3xl); color: var(--color-primary-dark); margin-bottom: var(--space-2); }
	.section-subtitle { text-align: center; color: var(--color-text-secondary); margin-bottom: var(--space-10); font-size: var(--font-size-lg); }
	.benefits-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: var(--space-6);
	}
	.benefit-card {
		text-align: center;
		padding: var(--space-8) var(--space-6);
		background: var(--color-bg);
		border-radius: var(--radius-lg);
		transition: all var(--transition-fast);
	}
	.benefit-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
	.benefit-icon { font-size: 2.5rem; display: block; margin-bottom: var(--space-4); }
	.benefit-card h3 { font-size: var(--font-size-lg); margin-bottom: var(--space-2); color: var(--color-primary); }
	.benefit-card p { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: var(--line-height-relaxed); }
</style>
