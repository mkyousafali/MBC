<script lang="ts">
	import { offers } from '$lib/data/demo';
	import OfferCard from '$lib/components/common/OfferCard.svelte';
</script>

<section class="offers-section" id="offers">
	<div class="section-container">
		<h2>Special Offers</h2>
		<p class="section-subtitle">Exclusive deals and seasonal offers for you</p>
		<div class="offers-grid">
			{#each offers as offer (offer.id)}
				<OfferCard {offer} />
			{/each}
		</div>
	</div>
</section>

<style>
	.offers-section {
		padding: var(--space-16) var(--space-5);
		background: var(--color-bg);
	}
	.section-container { max-width: var(--max-width); margin: 0 auto; }
	h2 { text-align: center; font-size: var(--font-size-3xl); color: var(--color-primary-dark); margin-bottom: var(--space-2); }
	.section-subtitle { text-align: center; color: var(--color-text-secondary); margin-bottom: var(--space-10); font-size: var(--font-size-lg); }
	.offers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--space-6);
	}
</style>
