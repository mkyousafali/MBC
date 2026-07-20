<script lang="ts">
	import { offers } from '$lib/data/demo';
	import OfferCard from '$lib/components/common/OfferCard.svelte';
</script>

<div class="offers-page">
	<h1>Special Offers</h1>
	<p class="subtitle">Exclusive deals for you</p>
	<div class="offers-grid">
		{#each offers as offer (offer.id)}
			<OfferCard {offer} />
		{/each}
	</div>
</div>

<style>
	.offers-page { padding: var(--space-5); }
	h1 { font-size: var(--font-size-2xl); margin-bottom: var(--space-1); }
	.subtitle { color: var(--color-text-secondary); margin-bottom: var(--space-5); }
	.offers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-4);
	}
</style>
