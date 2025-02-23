self.addEventListener("install", (event) => {
    console.log("Service Worker installé");
    event.waitUntil(
      caches.open("palanquee-cache").then((cache) => {
        return cache.addAll([
          "/",
          "/styles.css",
          "/scripts.js",
          "/images/mt-512x512.png"
        ]);
      })
    );
  });
  
  self.addEventListener("fetch", (event) => {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  });
  