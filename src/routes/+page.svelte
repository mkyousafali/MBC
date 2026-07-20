<script lang="ts">
	import PublicHeader from '$lib/components/public/PublicHeader.svelte';
	import HeroSection from '$lib/components/public/HeroSection.svelte';
	import FeaturedMenu from '$lib/components/public/FeaturedMenu.svelte';
	import OffersSection from '$lib/components/public/OffersSection.svelte';
	import WhyChooseUs from '$lib/components/public/WhyChooseUs.svelte';
	import AboutSection from '$lib/components/public/AboutSection.svelte';
	import ContactSection from '$lib/components/public/ContactSection.svelte';
	import PublicFooter from '$lib/components/public/PublicFooter.svelte';
	import CustomerAuthPanel from '$lib/components/public/CustomerAuthPanel.svelte';
	import TeamLoginPanel from '$lib/components/public/TeamLoginPanel.svelte';

	let showCustomerAuth = $state(false);
	let showTeamLogin = $state(false);
</script>

<svelte:head>
	<title>Malabar Biriyani Center — Authentic Malabar Taste</title>
</svelte:head>

<PublicHeader
	onLoginClick={() => showCustomerAuth = true}
	onTeamLoginClick={() => showTeamLogin = true}
/>
<main>
	<HeroSection onLoginClick={() => showCustomerAuth = true} />
	<FeaturedMenu />
	<OffersSection />
	<WhyChooseUs />
	<AboutSection />
	<ContactSection />
</main>
<PublicFooter />

<CustomerAuthPanel bind:open={showCustomerAuth} />
<TeamLoginPanel bind:open={showTeamLogin} />
