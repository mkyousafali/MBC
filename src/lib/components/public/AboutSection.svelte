<section class="about-section" id="about">
	<div class="section-container">
		<h2>About Malabar Biriyani Center</h2>
		<div class="about-content">
			<div class="about-text">
				<p>Founded with a passion for authentic Malabar cuisine, Malabar Biriyani Center brings you the finest biriyani and traditional Kerala meals. Our recipes, perfected over years, use the highest quality spices and freshest ingredients sourced from local farms and trusted suppliers.</p>
				<p>Whether you are dining in, ordering for a family gathering or planning a grand celebration, our dedicated team ensures every meal is a memorable experience. We take pride in combining age-old culinary traditions with modern service standards.</p>
				<div class="about-stats">
					<div class="about-stat">
						<span class="stat-num">5+</span>
						<span class="stat-label">Years Serving</span>
					</div>
					<div class="about-stat">
						<span class="stat-num">50K+</span>
						<span class="stat-label">Happy Customers</span>
					</div>
					<div class="about-stat">
						<span class="stat-num">30+</span>
						<span class="stat-label">Menu Items</span>
					</div>
					<div class="about-stat">
						<span class="stat-num">4.8</span>
						<span class="stat-label">Rating</span>
					</div>
				</div>
			</div>
			<div class="about-visual">
				<div class="about-image-placeholder">
					<img src="/Logo.png" alt="MBC" class="about-logo" />
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.about-section {
		padding: var(--space-16) var(--space-5);
		background: var(--color-bg);
	}
	.section-container { max-width: var(--max-width); margin: 0 auto; }
	h2 { text-align: center; font-size: var(--font-size-3xl); color: var(--color-primary-dark); margin-bottom: var(--space-10); }
	.about-content {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: var(--space-10);
		align-items: center;
	}
	.about-text p {
		font-size: var(--font-size-base);
		line-height: var(--line-height-relaxed);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
	}
	.about-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-4);
		margin-top: var(--space-6);
	}
	.about-stat { text-align: center; }
	.stat-num {
		display: block;
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
	}
	.stat-label { font-size: var(--font-size-xs); color: var(--color-text-secondary); }
	.about-visual { display: flex; justify-content: center; }
	.about-image-placeholder {
		width: 300px; height: 300px;
		border-radius: var(--radius-xl);
		background: linear-gradient(135deg, var(--color-primary-50), #FFF8E1);
		display: flex; align-items: center; justify-content: center;
		box-shadow: var(--shadow-md);
	}
	.about-logo { height: 120px; }
	@media (max-width: 768px) {
		.about-content { grid-template-columns: 1fr; }
		.about-visual { order: -1; }
		.about-image-placeholder { width: 200px; height: 200px; }
		.about-logo { height: 80px; }
		.about-stats { grid-template-columns: repeat(2, 1fr); }
	}
</style>
