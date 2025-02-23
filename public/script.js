if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(() => console.log("Service Worker enregistré !"))
    .catch((err) => console.log("Erreur Service Worker : ", err));
}
