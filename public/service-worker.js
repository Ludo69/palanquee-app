const CACHE_NAME = "plongee-app-cache-v2";
const urlsToCache = [
  "/", // PAGE D'ACCUEIL : IMPORTANT pour Safari
  "/styles.css",
  "/script.js",
  "/logo.png",
];

// Installation du Service Worker et mise en cache initiale
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Stratégie "Cache First" : Essaye d’abord le cache, puis le réseau
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    }).catch(() => {
      // S’il n’y a ni cache ni réseau, on affiche une page hors ligne personnalisée
      return caches.match("/");
    })
  );
});

// Nettoyage du cache obsolète lors d'une mise à jour
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});
