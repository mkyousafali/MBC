<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { PUBLIC_PIXABAY_API_KEY } from '$env/static/public';

	import { untrack } from 'svelte';

	let { show = $bindable(false), onSelect, initialQuery = '' }: { show: boolean; onSelect: (url: string) => void; initialQuery?: string } = $props();

	let query = $state('');
	let results = $state<any[]>([]);
	let searching = $state(false);
	let downloading = $state(false);
	let selectedIdx = $state(-1);
	let searched = $state(false);

	$effect(() => {
		if (show && initialQuery) {
			query = initialQuery;
			untrack(() => searchImages());
		}
	});

	async function searchImages() {
		if (!query.trim()) return;
		searching = true;
		selectedIdx = -1;
		try {
			const url = `https://pixabay.com/api/?key=${PUBLIC_PIXABAY_API_KEY}&q=${encodeURIComponent(query.trim())}&image_type=photo&per_page=24&safesearch=true`;
			const res = await fetch(url);
			const data = await res.json();
			results = data.hits || [];
		} catch (err) {
			results = [];
		}
		searching = false;
		searched = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') searchImages();
	}

	async function useImage(img: any) {
		downloading = true;
		try {
			// Download the image
			const res = await fetch(img.webformatURL);
			const blob = await res.blob();
			const ext = img.webformatURL.split('.').pop()?.split('?')[0] || 'jpg';
			const path = `${crypto.randomUUID()}.${ext}`;

			// Upload to Supabase Storage
			const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: blob.type });
			if (error) throw new Error(error.message);

			const { data } = supabase.storage.from('product-images').getPublicUrl(path);
			onSelect(data.publicUrl);
			close();
		} catch (err: any) {
			alert('Failed to save image: ' + err.message);
		}
		downloading = false;
	}

	function close() {
		show = false;
		query = '';
		results = [];
		selectedIdx = -1;
		searched = false;
	}
</script>

{#if show}
	<div class="ism-overlay" onclick={close}>
		<div class="ism-modal" onclick={(e) => e.stopPropagation()}>
			<div class="ism-header">
				<h3>🔍 Search Images</h3>
				<button class="ism-close" onclick={close}>✕</button>
			</div>

			<div class="ism-search-bar">
				<input
					type="text"
					bind:value={query}
					placeholder="Search for images... e.g. chicken masala, vegetables"
					onkeydown={handleKeydown}
					autofocus
				/>
				<button class="ism-search-btn" onclick={searchImages} disabled={searching || !query.trim()}>
					{searching ? '⏳' : '🔍'} Search
				</button>
			</div>

			{#if downloading}
				<div class="ism-downloading">
					<span class="ism-spinner">⏳</span> Saving image...
				</div>
			{:else if searching}
				<div class="ism-loading">Searching images...</div>
			{:else if results.length > 0}
				<div class="ism-grid">
					{#each results as img, i}
						<button
							class="ism-card"
							class:selected={selectedIdx === i}
							onclick={() => selectedIdx = i}
							ondblclick={() => useImage(img)}
						>
							<img src={img.previewURL} alt={img.tags} loading="lazy" />
							{#if selectedIdx === i}
								<div class="ism-selected-badge">✓</div>
							{/if}
						</button>
					{/each}
				</div>

				<div class="ism-footer">
					<span class="ism-hint">Click to select, double-click to use directly</span>
					<div class="ism-actions">
						<button class="ism-btn-secondary" onclick={close}>Cancel</button>
						<button class="ism-btn-secondary" onclick={() => { results = []; searched = false; query = ''; }}>Search Again</button>
						<button class="ism-btn-primary" onclick={() => selectedIdx >= 0 && useImage(results[selectedIdx])} disabled={selectedIdx < 0}>
							Use This Image
						</button>
					</div>
				</div>
			{:else if searched}
				<div class="ism-empty">
					<p>No images found for "{query}"</p>
					<button class="ism-btn-secondary" onclick={() => { searched = false; }}>Try Again</button>
				</div>
			{:else}
				<div class="ism-empty">
					<p>Search for product images from Pixabay's free library</p>
				</div>
			{/if}

			<div class="ism-credit">Images by <a href="https://pixabay.com" target="_blank" rel="noopener">Pixabay</a></div>
		</div>
	</div>
{/if}

<style>
	.ism-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 10000; }
	.ism-modal { background: white; border-radius: 14px; width: 720px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 12px 48px rgba(0,0,0,0.2); overflow: hidden; }

	.ism-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; }
	.ism-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #2B2B2B; }
	.ism-close { border: none; background: none; font-size: 18px; cursor: pointer; color: #999; padding: 4px; }
	.ism-close:hover { color: #333; }

	.ism-search-bar { display: flex; gap: 8px; padding: 14px 20px; border-bottom: 1px solid #f0f0f0; }
	.ism-search-bar input { flex: 1; padding: 10px 14px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 13px; outline: none; }
	.ism-search-bar input:focus { border-color: #0E5A3C; }
	.ism-search-btn { padding: 10px 18px; border: none; background: #0E5A3C; color: white; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
	.ism-search-btn:hover { background: #0a4830; }
	.ism-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.ism-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 14px 20px; overflow-y: auto; flex: 1; max-height: 400px; }
	.ism-card { position: relative; border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; padding: 0; background: #f5f5f5; aspect-ratio: 1; transition: border-color 0.15s, transform 0.15s; }
	.ism-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.ism-card:hover { border-color: #C9A24D; transform: scale(1.02); }
	.ism-card.selected { border-color: #0E5A3C; }
	.ism-selected-badge { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; background: #0E5A3C; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }

	.ism-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid #eee; }
	.ism-hint { font-size: 11px; color: #999; }
	.ism-actions { display: flex; gap: 8px; }
	.ism-btn-primary { padding: 8px 18px; border: none; background: #0E5A3C; color: white; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
	.ism-btn-primary:hover { background: #0a4830; }
	.ism-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
	.ism-btn-secondary { padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 8px; font-size: 12px; cursor: pointer; color: #555; }
	.ism-btn-secondary:hover { background: #f5f5f5; }

	.ism-loading, .ism-empty { text-align: center; padding: 40px 20px; color: #888; font-size: 14px; }
	.ism-downloading { text-align: center; padding: 40px 20px; color: #0E5A3C; font-size: 14px; font-weight: 600; }
	.ism-spinner { display: inline-block; animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.ism-credit { text-align: center; padding: 6px; font-size: 10px; color: #bbb; border-top: 1px solid #f5f5f5; }
	.ism-credit a { color: #999; text-decoration: none; }
	.ism-credit a:hover { text-decoration: underline; }
</style>
