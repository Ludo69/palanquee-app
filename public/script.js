// Vérifie que Supabase est bien chargé
if (!window.supabase) {
    console.error("❌ Supabase n'a pas été chargé !");
} else {
    // Initialisation de Supabase
const { createClient } = window.supabase;


    // Initialisation de Supabase
    const supabaseUrl = "https://xoiyziphxfkfxfawcafm.supabase.co"; // Remplace avec ton URL Supabase
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvaXl6aXBoeGZrZnhmYXdjYWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwODQ3MTMsImV4cCI6MjA1NTY2MDcxM30.tY-3BgdAtSuv1ScGOgnimQEsLnk1mbnN9A2jYatsaNE"; // Remplace avec ta clé API publique

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log("✅ Supabase initialisé !");
}


console.log("📦 Tentative de connexion à IndexedDB...");

if (!window.indexedDB) {
    console.log("❌ IndexedDB n'est pas supporté par ce navigateur.");
} else {
    console.log("✅ IndexedDB est bien supporté !");
}

const DB_NAME = "PalanqueeDB";
const DB_VERSION = 2;

// Ouvrir ou créer la base IndexedDB
const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = function (event) {
    let db = event.target.result;

    // 🟢 Créer la table plongees (mise à jour avec tous les champs)
    if (!db.objectStoreNames.contains("plongees")) {
        let plongeeStore = db.createObjectStore("plongees", { keyPath: "id" });
        plongeeStore.createIndex("sortie_id", "sortie_id", { unique: false });
        plongeeStore.createIndex("date", "date", { unique: false });
        plongeeStore.createIndex("numero", "numero", { unique: false });
        plongeeStore.createIndex("site", "site", { unique: false });
        plongeeStore.createIndex("nomdp", "nomdp", { unique: false });
    }

// 🟢 Créer la table palanquees (mise à jour avec tous les champs)
if (!db.objectStoreNames.contains("palanquees")) {
    let palanqueeStore = db.createObjectStore("palanquees", { keyPath: "id" });
    palanqueeStore.createIndex("plongee_id", "plongee_id", { unique: false });
    palanqueeStore.createIndex("nom", "nom", { unique: false });
    palanqueeStore.createIndex("profondeur", "profondeur", { unique: false });
    palanqueeStore.createIndex("duree", "duree", { unique: false });
    palanqueeStore.createIndex("paliers", "paliers", { unique: false });

    // 🔹 Ajout du champ `status` pour gérer la synchronisation (offline, modified, synced)
    palanqueeStore.createIndex("status", "status", { unique: false });
}


    // 🟢 Créer la table palanquees_plongeurs (NOUVELLE TABLE)
    if (!db.objectStoreNames.contains("palanquees_plongeurs")) {
        let palPlongeursStore = db.createObjectStore("palanquees_plongeurs", { keyPath: "id" });
        palPlongeursStore.createIndex("palanquee_id", "palanquee_id", { unique: false });
        palPlongeursStore.createIndex("plongeur_id", "plongeur_id", { unique: false });
        palPlongeursStore.createIndex("nom_plongeur", "nom_plongeur", { unique: false });
        palPlongeursStore.createIndex("niveau_plongeur", "niveau_plongeur", { unique: false });
        palPlongeursStore.createIndex("niveau_plongeur_historique", "niveau_plongeur_historique", { unique: false });
    }

    console.log("✅ IndexedDB : Structure mise à jour !");
};


request.onsuccess = function (event) {
    console.log("✅ IndexedDB : Connexion réussie !");
    event.target.result.close(); // Ferme la connexion après vérification
};

request.onerror = function (event) {
    console.log("❌ Erreur IndexedDB :", event.target.errorCode);
};

window.addEventListener("online", () => {
    console.log("🟢 En ligne : synchronisation des données...");
    synchroniserPalanqueesAvecSupabase();
});

window.addEventListener("offline", () => {
    console.log("🔴 Hors ligne : utilisation des données locales.");
});

// 📌 Fonction pour ajouter une palanquée à IndexedDB
function generateUUID() {
    return crypto.randomUUID();
}

function ajouterPlongee(sortieId, date, numero, site, nomdp) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
        let db = event.target.result;
        let transaction = db.transaction("plongees", "readwrite");
        let store = transaction.objectStore("plongees");

        let plongee = {
            id: generateUUID(),
            sortie_id: sortieId,
            date: date,
            numero: numero,
            site: site,
            nomdp: nomdp
        };

        store.add(plongee);
        transaction.oncomplete = function () {
            db.close();
            console.log("✅ Plongée ajoutée !");
        };
    };
}

function ajouterPalanquee(plongeeId, nom, profondeur, duree, paliers) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
        let db = event.target.result;
        let transaction = db.transaction("palanquees", "readwrite");
        let store = transaction.objectStore("palanquees");

        let palanquee = {
            id: generateUUID(),
            plongee_id: plongeeId,
            nom: nom,
            profondeur: profondeur,
            duree: duree,
            paliers: paliers
        };

        store.add(palanquee);
        transaction.oncomplete = function () {
            db.close();
            console.log("✅ Palanquée ajoutée !");
        };
    };
}

function ajouterPlongeurDansPalanquee(palanqueeId, plongeurId, nom, niveau, niveauHistorique) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
        let db = event.target.result;
        let transaction = db.transaction("palanquees_plongeurs", "readwrite");
        let store = transaction.objectStore("palanquees_plongeurs");

        let record = {
            id: generateUUID(),
            palanquee_id: palanqueeId,
            plongeur_id: plongeurId,
            nom_plongeur: nom,
            niveau_plongeur: niveau,
            niveau_plongeur_historique: niveauHistorique
        };

        store.add(record);
        transaction.oncomplete = function () {
            db.close();
            console.log("✅ Plongeur ajouté à la palanquée !");
        };
    };
}

function recupererPalanqueesParPlongee(plongeeId, callback) {
    if (!navigator.onLine) {
        console.log("🔴 Hors ligne : récupération des palanquées depuis IndexedDB...");
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = function (event) {
            let db = event.target.result;
            let transaction = db.transaction("palanquees", "readonly");
            let store = transaction.objectStore("palanquees");
            let index = store.index("plongee_id");
            let range = IDBKeyRange.only(plongeeId);

            let palanquees = [];
            let cursorRequest = index.openCursor(range);
            cursorRequest.onsuccess = function (event) {
                let cursor = event.target.result;
                if (cursor) {
                    palanquees.push(cursor.value);
                    cursor.continue();
                } else {
                    callback(palanquees);
                }
            };
        };
    } else {
        console.log("🟢 En ligne : récupération des palanquées depuis Supabase...");
        recupererPalanqueesDepuisSupabase(plongeeId).then(callback);
    }
}


function afficherPalanquees(plongeeId) {
    recupererPalanqueesParPlongee(plongeeId, (palanquees) => {
        let listePalanquees = document.getElementById("liste-palanquees");
        if (!listePalanquees) {
            console.error("❌ Élément #liste-palanquees introuvable !");
            return;
        }

        listePalanquees.innerHTML = ""; // Nettoyer la liste avant d'ajouter

        palanquees.forEach((palanquee) => {
            let li = document.createElement("li");
            li.textContent = `🌊 ${palanquee.nom} | Prof: ${palanquee.profondeur}m, Temps: ${palanquee.duree}min, Paliers: ${palanquee.paliers}`;
            listePalanquees.appendChild(li);
        });

        console.log("✅ Palanquées affichées !");
    });
}

async function recupererPalanqueesDepuisSupabase() {
    try {
        let { data, error } = await supabase
            .from("palanquees")
            .select("*");

        if (error) throw error;
        
        console.log("✅ Palanquées récupérées depuis Supabase :", data);
        return data;
    } catch (err) {
        console.error("❌ Erreur Supabase :", err);
        return [];
    }
}

function modifierPalanquee(id, nouvellesInfos) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
        let db = event.target.result;
        let transaction = db.transaction("palanquees", "readwrite");
        let store = transaction.objectStore("palanquees");

        let getRequest = store.get(id);
        getRequest.onsuccess = function () {
            let palanquee = getRequest.result;
            if (palanquee) {
                Object.assign(palanquee, nouvellesInfos);
                palanquee.status = "modified";  // Marquer comme modifiée

                store.put(palanquee);
                console.log("✅ Palanquée mise à jour en local !");
            }
        };

        transaction.oncomplete = function () {
            db.close();
        };
    };
}


// Fonction pour synchroniser les palanquées avec Supabase
async function synchroniserPalanqueesAvecSupabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
        let db = event.target.result;
        let transaction = db.transaction("palanquees", "readwrite");
        let store = transaction.objectStore("palanquees");

        let index = store.index("status");
        let range = IDBKeyRange.only("modified");  // Récupérer les palanquées modifiées
        let palanqueesAModifier = [];

        let cursorRequest = index.openCursor(range);
        cursorRequest.onsuccess = async function (event) {
            let cursor = event.target.result;
            if (cursor) {
                palanqueesAModifier.push(cursor.value);
                cursor.continue();
            } else {
                if (palanqueesAModifier.length > 0) {
                    let { data, error } = await supabase
                        .from("palanquees")
                        .upsert(palanqueesAModifier);

                    if (error) {
                        console.error("❌ Erreur de synchronisation :", error);
                        return;
                    }

                    console.log("✅ Palanquées synchronisées avec Supabase :", data);

                    // Marquer les palanquées comme synchronisées
                    palanqueesAModifier.forEach(palanquee => {
                        let updateRequest = store.put({
                            ...palanquee,
                            status: "synced"
                        });
                        updateRequest.onsuccess = function () {
                            console.log("✅ Palanquée synchronisée et mise à jour en local !");
                        };
                    });
                }
            }
        };
    };
}

async function synchroniserPlongeesAvecIndexedDB() {
    try {
        let { data, error } = await supabase.from("plongees").select("*");
        if (error) throw error;

        console.log("✅ Plongées récupérées depuis Supabase :", data);

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = function (event) {
            let db = event.target.result;
            let transaction = db.transaction("plongees", "readwrite");
            let store = transaction.objectStore("plongees");

            data.forEach(plongee => {
                store.put(plongee); // Stocker les plongées
            });

            transaction.oncomplete = function () {
                db.close();
                console.log("✅ Plongées synchronisées avec IndexedDB !");
            };
        };

        request.onerror = function (event) {
            console.error("❌ Erreur ouverture IndexedDB :", event.target.error);
        };
    } catch (err) {
        console.error("❌ Erreur Supabase :", err);
    }
}

function recupererPlongeesDepuisIndexedDB(callback) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onsuccess = function (event) {
        let db = event.target.result;
        let transaction = db.transaction("plongees", "readonly");
        let store = transaction.objectStore("plongees");

        let plongees = [];
        let cursorRequest = store.openCursor();

        cursorRequest.onsuccess = function (event) {
            let cursor = event.target.result;
            if (cursor) {
                plongees.push(cursor.value);
                cursor.continue();
            } else {
                console.log("✅ Plongées récupérées depuis IndexedDB :", plongees);
                if (callback) callback(plongees);
            }
        };

        transaction.oncomplete = function () {
            db.close();
        };
    };

    request.onerror = function (event) {
        console.error("❌ Erreur ouverture IndexedDB :", event.target.error);
    };
}

function afficherPlongeesDansCalendrier(plongees) {
    let calendrier = document.getElementById("calendrier");
    if (!calendrier) {
        console.error("❌ Élément #calendrier introuvable !");
        return;
    }

    calendrier.innerHTML = ""; // Nettoyer avant d'afficher

    plongees.forEach((plongee) => {
        let div = document.createElement("div");
        div.classList.add("plongee-item");
        div.textContent = `📅 ${plongee.date} - ${plongee.site}`;
        div.setAttribute("data-id", plongee.id);

        div.addEventListener("click", function () {
            selectionnerPlongee(plongee.id);
        });

        calendrier.appendChild(div);
    });

    console.log("✅ Plongées affichées dans le calendrier !");
}

// Récupérer et afficher les plongées en fonction de la connexion
if (navigator.onLine) {
    synchroniserPlongeesAvecIndexedDB();
    recupererPlongeesDepuisIndexedDB(afficherPlongeesDansCalendrier);
} else {
    recupererPlongeesDepuisIndexedDB(afficherPlongeesDansCalendrier);
}



