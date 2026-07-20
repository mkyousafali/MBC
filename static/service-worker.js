/// <reference lib="webworker" />

const CACHE_NAME = 'mbc-one-os-v1';

self.addEventListener('install', (event) => {
	// @ts-ignore
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	// @ts-ignore
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
	// Basic network-first strategy
	// Full offline support will be added later
});
