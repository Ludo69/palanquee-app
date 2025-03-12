const CACHE_NAME = "plongee-app-cache-v3";
const urlsToCache = [
  "/", // PAGE D'ACCUEIL : IMPORTANT pour Safari
  "/styles.css",
  "/script.js"
];

// Installation du Service Worker et mise en cache initiale
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// ⚡ Stratégie "Network First" : Essaye d'abord le réseau, sinon fallback sur le cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request) // Essaye d'aller sur le réseau
      .then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone()); // Met à jour le cache
          return response;
        });
      })
      .catch(() => caches.match(event.request)) // En cas d’échec, prend dans le cache
  );
});

// Nettoyage des anciennes versions de cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
});
