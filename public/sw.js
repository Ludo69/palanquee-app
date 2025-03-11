const CACHE_NAME = "palanquee-cache-v1";
const urlsToCache = [
  "/",
  "/styles.css",
  "/scripts.js",
  "/icons/mt-192x192.png",
  "/icons/mt-512x512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker installé, mise en cache des ressources');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        console.log('Ressource trouvée dans le cache:', event.request.url);
        return response;
      }
      console.log('Ressource non trouvée dans le cache, récupération via le réseau:', event.request.url);
      return fetch(event.request);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker supprimé, suppression du cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  console.log('Service Worker activé');
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-settings') {
    event.waitUntil(syncSettings());
  }
});

function syncSettings() {
  return openDatabase().then(db => {
    const transaction = db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');

    return store.getAll().then(settings => {
      return Promise.all(settings.map(setting => {
        return fetch('/api/settings', {
          method: 'POST',
          body: JSON.stringify(setting),
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }));
    });
  });
}