<script lang="ts">
	import type { Offer } from '$lib/types';
	import { toasts } from '$lib/stores/toast';
	import Button from './Button.svelte';

	let { offer }: { offer: Offer } = $props();

	function handleView() {
		toasts.add(`Offer code: ${offer.code}`, 'info');
	}
</script>

<div class="offer-card">
	<div class="offer-discount">{offer.discount}</div>
	<div class="offer-content">
		<h3>{offer.title}</h3>
		<p>{offer.description}</p>
		<div class="offer-footer">
			<span class="offer-validity">{offer.validity}</span>
			<Button variant="accent" size="sm" onclick={handleView}>View Offer</Button>
		</div>
	</div>
</div>

<style>
	.offer-card {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: all var(--transition-fast);
		border-left: 4px solid var(--color-accent);
	}
	.offer-card:hover { box-shadow: var(--shadow-md); }
	.offer-discount {
		background: linear-gradient(135deg, var(--color-accent), var(--color-accent-light));
		color: white;
		padding: var(--space-4);
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		text-align: center;
	}
	.offer-content { padding: var(--space-4); }
	.offer-content h3 { font-size: var(--font-size-base); margin-bottom: var(--space-2); }
	.offer-content p { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-3); }
	.offer-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
	.offer-validity { font-size: var(--font-size-xs); color: var(--color-text-light); }
</style>
