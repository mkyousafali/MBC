<section class="contact-section" id="contact">
	<div class="section-container">
		<h2>Contact & Location</h2>
		<p class="section-subtitle">Visit us or get in touch anytime</p>
		<div class="contact-grid">
			<div class="contact-info">
				<div class="contact-item">
					<span class="contact-icon">📞</span>
					<div>
						<h4>Phone</h4>
						<p>+91 495 276 1234</p>
					</div>
				</div>
				<div class="contact-item">
					<span class="contact-icon">💬</span>
					<div>
						<h4>WhatsApp</h4>
						<p>+91 98765 43210</p>
					</div>
				</div>
				<div class="contact-item">
					<span class="contact-icon">📧</span>
					<div>
						<h4>Email</h4>
						<p>info@malabarbiriyanicenter.com</p>
					</div>
				</div>
				<div class="contact-item">
					<span class="contact-icon">📍</span>
					<div>
						<h4>Address</h4>
						<p>MG Road, Near City Centre<br />Kozhikode, Kerala 673001</p>
					</div>
				</div>
				<div class="contact-item">
					<span class="contact-icon">🕐</span>
					<div>
						<h4>Opening Hours</h4>
						<p>Mon – Sun: 11:00 AM – 11:00 PM<br />Breakfast: Fri – Sun: 7:30 AM</p>
					</div>
				</div>
			</div>
			<div class="map-placeholder">
				<div class="map-box">
					<span>📍</span>
					<p>Map — Malabar Biriyani Center</p>
					<small>Kozhikode, Kerala</small>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.contact-section {
		padding: var(--space-16) var(--space-5);
		background: var(--color-white);
	}
	.section-container { max-width: var(--max-width); margin: 0 auto; }
	h2 { text-align: center; font-size: var(--font-size-3xl); color: var(--color-primary-dark); margin-bottom: var(--space-2); }
	.section-subtitle { text-align: center; color: var(--color-text-secondary); margin-bottom: var(--space-10); font-size: var(--font-size-lg); }
	.contact-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-8);
		align-items: start;
	}
	.contact-info { display: flex; flex-direction: column; gap: var(--space-5); }
	.contact-item {
		display: flex; gap: var(--space-4); align-items: flex-start;
		padding: var(--space-4);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}
	.contact-icon { font-size: 1.5rem; flex-shrink: 0; }
	.contact-item h4 { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); margin-bottom: 2px; }
	.contact-item p { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: var(--line-height-relaxed); }
	.map-placeholder { display: flex; align-items: stretch; }
	.map-box {
		width: 100%; min-height: 360px;
		background: var(--color-bg-alt);
		border-radius: var(--radius-lg);
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		color: var(--color-text-light);
		border: 2px dashed var(--color-border);
	}
	.map-box span { font-size: 3rem; margin-bottom: var(--space-2); }
	.map-box p { font-weight: var(--font-weight-medium); }
	.map-box small { font-size: var(--font-size-xs); }
	@media (max-width: 768px) {
		.contact-grid { grid-template-columns: 1fr; }
	}
</style>
