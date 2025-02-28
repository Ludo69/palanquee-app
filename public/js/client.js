if ('serviceWorker' in navigator && 'SyncManager' in window) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('Service Worker enregistré avec succès:', registration);

      // Vérifiez l'état du service worker
      if (registration.installing) {
        console.log('Service Worker en cours d\'installation');
      } else if (registration.waiting) {
        console.log('Service Worker en attente');
      } else if (registration.active) {
        console.log('Service Worker actif');
      }

      if (navigator.onLine) {
        registration.sync.register('sync-settings');
      } else {
        window.addEventListener('online', () => {
          registration.sync.register('sync-settings');
        });
      }
    })
    .catch(err => {
      console.log('Erreur lors de l\'enregistrement du Service Worker ou du sync:', err);
    });
}

function saveSettingOffline(setting) {
  saveSetting(setting).then(() => {
    if (navigator.onLine) {
      navigator.serviceWorker.ready.then(swRegistration => {
        return swRegistration.sync.register('sync-settings');
      });
    }
  });
}