// ✅ Charger Supabase depuis un CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 🔗 Configuration de Supabase
const supabaseUrl = 'https://xoiyziphxfkfxfawcafm.supabase.co';
const supabaseKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvaXl6aXBoeGZrZnhmYXdjYWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwODQ3MTMsImV4cCI6MjA1NTY2MDcxM30.tY-3BgdAtSuv1ScGOgnimQEsLnk1mbnN9A2jYatsaNE";

const supabase = createClient(supabaseUrl, supabaseKey);

// 🔄 IndexedDB : Déclaration globale
let db;

// ✅ Ouvrir IndexedDB et récupérer les plongées au chargement
document.addEventListener("DOMContentLoaded", async () => {
    console.log("✅ Initialisation en cours...");

    const enLigne = verifierConnexionInternet();
    console.log(`🌐 Mode : ${enLigne ? "En ligne" : "Hors ligne"}`);

    console.log("📂 Ouverture IndexedDB...");
    await ouvrirIndexedDB(); 

    console.log("⬇️ Récupération des plongées...");
    await recupererPlongees(); 

    console.log("🎉 Initialisation terminée !");
});


// 🗄️ Fonction pour ouvrir IndexedDB avec la bonne structure
async function ouvrirIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("PalanqueeDB", 2);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 📌 Table "plongees"
            if (!db.objectStoreNames.contains("plongees")) {
                const store = db.createObjectStore("plongees", { keyPath: "id" });
                store.createIndex("sortie_id", "sortie_id", { unique: false });
                store.createIndex("date", "date", { unique: false });
                store.createIndex("numero", "numero", { unique: false });
                store.createIndex("site", "site", { unique: false });
                store.createIndex("nomdp", "nomdp", { unique: false });
            }

            // 📌 Table "palanquees"
            if (!db.objectStoreNames.contains("palanquees")) {
                const store = db.createObjectStore("palanquees", { keyPath: "id" });
                store.createIndex("plongee_id", "plongee_id", { unique: false });
                store.createIndex("nom", "nom", { unique: false });
                store.createIndex("profondeur", "profondeur", { unique: false });
                store.createIndex("duree", "duree", { unique: false });
                store.createIndex("paliers", "paliers", { unique: false });
            }

            // 📌 Table "palanquees_plongeurs"
            if (!db.objectStoreNames.contains("palanquees_plongeurs")) {
                const store = db.createObjectStore("palanquees_plongeurs", { keyPath: "id" });
                store.createIndex("palanquee_id", "palanquee_id", { unique: false });
                store.createIndex("plongeur_id", "plongeur_id", { unique: false });
                store.createIndex("nom_plongeur", "nom_plongeur", { unique: false });
                store.createIndex("niveau_plongeur", "niveau_plongeur", { unique: false });
                store.createIndex("niveau_plongeur_historique", "niveau_plongeur_historique", { unique: false });
            }

            console.log("✅ Structure IndexedDB mise à jour !");
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            //console.log("✅ IndexedDB ouvert avec succès !");
            resolve(db);
        };

        request.onerror = () => reject("❌ Erreur d'ouverture IndexedDB");
    });
}

// 🌐 Vérifier la connexion internet
function verifierConnexionInternet() {
    if (navigator.onLine) {
        return true;
    } else {
        return false;
    }
}

// Écouter les changements de connexion
window.addEventListener("online", () => console.log("🔄 Reconnexion détectée !"));
window.addEventListener("offline", () => console.log("⚠️ Déconnexion détectée !"));

// ⬇️ Fonction pour récupérer les plongées (en ligne ou hors ligne)
async function recupererPlongees() {
    await ouvrirIndexedDB(); // ✅ S'assurer que IndexedDB est bien ouvert

    if (verifierConnexionInternet()) {
        await recupererPlongeesDepuisSupabase();
    } else {
        await recupererPlongeesDepuisIndexedDB();
    }
}

// ⬇️ Fonction pour récupérer les plongées depuis Supabase
async function recupererPlongeesDepuisSupabase() {
    try {
        const { data, error } = await supabase.from("plongees").select("*");

        if (error) throw error;
        console.log("✅ Plongées récupérées depuis Supabase :", data); // ➜ Vérifie si Supabase retourne bien des données !

        if (data.length === 0) {
            console.warn("⚠️ Aucune plongée trouvée dans Supabase !");
            return; // Evite d'écraser IndexedDB avec rien
        }

        // Stocker en IndexedDB
        await enregistrerPlongeesDansIndexedDB(data);
    } catch (err) {
        console.error("❌ Erreur lors de la récupération des plongées :", err);
    }
}


// ⬇️ Fonction pour récupérer les plongées depuis IndexedDB
async function recupererPlongeesDepuisIndexedDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            console.error("⚠️ IndexedDB non initialisé !");
            reject("❌ IndexedDB non initialisé");
            return;
        }

        const transaction = db.transaction("plongees", "readonly");
        const store = transaction.objectStore("plongees");
        const getRequest = store.getAll();

        getRequest.onsuccess = () => {
            console.log("📂 Contenu actuel de la table 'plongees' dans IndexedDB :", getRequest.result);
            resolve(getRequest.result);
        };
        getRequest.onerror = () => reject("❌ Erreur lors de la récupération depuis IndexedDB");
    });
}


// 🗄️ Fonction pour enregistrer les plongées dans IndexedDB (sans logs inutiles)
async function enregistrerPlongeesDansIndexedDB(plongees) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("❌ IndexedDB non initialisé");

        const transaction = db.transaction("plongees", "readwrite");
        const store = transaction.objectStore("plongees");

        store.clear(); // Supprime les anciennes données
        plongees.forEach(plongee => store.put(plongee));

        transaction.oncomplete = () => {
            console.log(`✅ ${plongees.length} plongée(s) enregistrée(s) dans IndexedDB !`);
            resolve();
        };
        transaction.onerror = () => reject("❌ Erreur lors de l'enregistrement en IndexedDB");
    });
}
