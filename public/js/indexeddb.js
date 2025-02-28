function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('palanqueeDB', 1);

    request.onerror = event => {
      reject('Database error: ' + event.target.errorCode);
    };

    request.onsuccess = event => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = event => {
      const db = event.target.result;
      db.createObjectStore('settings', { keyPath: 'id' });
    };
  });
}

function saveSetting(setting) {
  openDatabase().then(db => {
    const transaction = db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    store.put(setting);
  });
}