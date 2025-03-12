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
      caches.open("v1").then(async (cache) => {
          const cacheKeys = await cache.keys();
          const cachedUrls = cacheKeys.map(request => request.url);

          const urlsToCache = [
              "/",
              "/styles.css",
              "/script.js"
          ].filter(url => !cachedUrls.includes(url));

          return cache.addAll(urlsToCache);
      }).catch(error => {
          console.error("Erreur lors de l'ajout au cache :", error);
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
              cacheNames
                  .filter(cacheName => cacheName !== "plongee-app-cache-v2") // Garde uniquement la dernière version
                  .map(cacheName => caches.delete(cacheName))
          );
      })
  );
});

