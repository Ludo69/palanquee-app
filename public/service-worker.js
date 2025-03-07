// Le nom du cache
const CACHE_NAME = 'palanquee-cache-v1';

// Liste des ressources à mettre en cache
const CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/src/index.css',
  '/src/App.tsx',
  '/src/main.tsx'
];

// Installation du service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache ouvert');
        return cache.addAll(CACHE_URLS);
      })
      .catch((error) => {
        console.error('Erreur lors de la mise en cache:', error);
      })
  );
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Stratégie de cache : Cache First, puis Network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Si la ressource est dans le cache, on la retourne
        if (response) {
          return response;
        }

        // Sinon, on fait la requête réseau
        return fetch(event.request)
          .then((response) => {
            // On ne met en cache que les requêtes réussies
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // On clone la réponse car elle ne peut être utilisée qu'une fois
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // En cas d'erreur réseau, on peut retourner une page d'erreur en cache
            return caches.match('/offline.html');
          });
      })
  );
});

// Écoute des messages pour forcer la mise à jour du cache
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});