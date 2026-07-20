<footer class="public-footer">
	<div class="footer-container">
		<div class="footer-grid">
			<div class="footer-brand">
				<img src="/Logo.png" alt="Malabar Biriyani Center" class="footer-logo" />
				<p>Authentic Malabar cuisine crafted with passion. Quality ingredients, traditional recipes and modern convenience.</p>
			</div>
			<div class="footer-links">
				<h4>Quick Links</h4>
				<a href="#home">Home</a>
				<a href="#menu">Menu</a>
				<a href="#offers">Special Offers</a>
				<a href="#about">About Us</a>
				<a href="#contact">Contact</a>
			</div>
			<div class="footer-links">
				<h4>Customer</h4>
				<a href="/customer">My Account</a>
				<a href="/customer/orders">My Orders</a>
				<a href="/customer/offers">Offers</a>
				<a href="/customer/profile">Profile</a>
			</div>
			<div class="footer-contact">
				<h4>Contact Us</h4>
				<p>📞 +91 495 276 1234</p>
				<p>💬 +91 98765 43210</p>
				<p>📧 info@malabarbiriyanicenter.com</p>
				<p>📍 MG Road, Kozhikode, Kerala</p>
				<div class="social-links">
					<a href="https://facebook.com" aria-label="Facebook" target="_blank" rel="noopener noreferrer">FB</a>
					<a href="https://instagram.com" aria-label="Instagram" target="_blank" rel="noopener noreferrer">IG</a>
					<a href="https://wa.me" aria-label="WhatsApp" target="_blank" rel="noopener noreferrer">WA</a>
					<a href="https://youtube.com" aria-label="YouTube" target="_blank" rel="noopener noreferrer">YT</a>
				</div>
			</div>
		</div>
		<div class="footer-bottom">
			<span>© 2026 Malabar Biriyani Center. All rights reserved.</span>
			<div class="footer-legal">
				<a href="/terms">Terms of Service</a>
				<a href="/privacy">Privacy Policy</a>
			</div>
		</div>
	</div>
</footer>

<style>
	.public-footer {
		background: var(--color-primary-dark);
		color: rgba(255, 255, 255, 0.85);
		padding: var(--space-12) var(--space-5) var(--space-6);
	}
	.footer-container {
		max-width: var(--max-width);
		margin: 0 auto;
	}
	.footer-grid {
		display: grid;
		grid-template-columns: 1.5fr 1fr 1fr 1.5fr;
		gap: var(--space-8);
		margin-bottom: var(--space-8);
	}
	.footer-brand p {
		font-size: var(--font-size-sm);
		line-height: var(--line-height-relaxed);
		margin-top: var(--space-3);
		opacity: 0.8;
	}
	.footer-logo { height: 40px; filter: brightness(2); }
	.footer-links {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.footer-links h4, .footer-contact h4 {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		margin-bottom: var(--space-2);
		color: white;
	}
	.footer-links a {
		font-size: var(--font-size-sm);
		color: rgba(255, 255, 255, 0.7);
		transition: color var(--transition-fast);
	}
	.footer-links a:hover { color: white; }
	.footer-contact p {
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-1);
		opacity: 0.85;
	}
	.social-links {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.social-links a {
		width: 36px; height: 36px;
		display: flex; align-items: center; justify-content: center;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		transition: background var(--transition-fast);
	}
	.social-links a:hover { background: rgba(255, 255, 255, 0.2); }
	.footer-bottom {
		border-top: 1px solid rgba(255, 255, 255, 0.15);
		padding-top: var(--space-5);
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--font-size-sm);
		opacity: 0.7;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.footer-legal { display: flex; gap: var(--space-4); }
	.footer-legal a { color: rgba(255, 255, 255, 0.7); }
	.footer-legal a:hover { color: white; }

	@media (max-width: 768px) {
		.footer-grid { grid-template-columns: 1fr; gap: var(--space-6); }
		.footer-bottom { flex-direction: column; text-align: center; }
	}
</style>
