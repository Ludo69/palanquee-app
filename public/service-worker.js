// Le nom du cache
const CACHE_NAME = 'palanquee-cache-v1';
const CACHE_URLS = [
    '/',                  // La page d'accueil
    '/index.html',        // Index principal
    '/manifest.json',     // Fichier de configuration du manifest
    '/icons/favicon.ico', // Icône du site
    '/images/plongeur.avif', // Image utilisée dans la page d'accueil
    '/js/indexeddb.js',   // Ton script pour IndexedDB
    '/js/client.js',      // Ton script principal
    '/css/styles.css',    // Ton fichier CSS
];

// Événement d'installation du service worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CACHE_URLS); // Met les fichiers dans le cache
        })
    );
});

// Événement d'activation du service worker
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME]; // Permet de supprimer les anciens caches

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName); // Supprime les anciens caches
                    }
                })
            );
        })
    );
});

// Gestion des requêtes réseau
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Si la réponse est dans le cache, on la renvoie
                return cachedResponse;
            }

            // Sinon, on fait la requête réseau normale
            return fetch(event.request).then((response) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    // Ajoute la réponse au cache avant de la renvoyer
                    cache.put(event.request, response.clone());
                    return response;
                });
            });
        })
    );
});
