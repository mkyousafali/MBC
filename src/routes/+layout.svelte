<script lang="ts">
	import '../styles/global.css';
	import ToastContainer from '$lib/components/common/ToastContainer.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});
</script>

<ToastContainer />
{@render children()}
