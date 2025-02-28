const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const app = express();
const port = 3000;

// Configuration de Supabase
const supabaseUrl = "https://xoiyziphxfkfxfawcafm.supabase.co";
const supabaseKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvaXl6aXBoeGZrZnhmYXdjYWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwODQ3MTMsImV4cCI6MjA1NTY2MDcxM30.tY-3BgdAtSuv1ScGOgnimQEsLnk1mbnN9A2jYatsaNE";
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// Routes
app.get("/", (req, res) => {
    res.render("index");
});

// Gestion des plongeurs
app.get("/gestion-plongeurs", async (req, res) => {
    const { data, error } = await supabase.from("plongeurs").select("*");
    res.render("gestion_plongeurs", { plongeurs: data });
});

app.post("/ajouter-plongeur", async (req, res) => {
    const { nom, niveau } = req.body;
    const { error } = await supabase
        .from("plongeurs")
        .insert([{ nom, niveau, sortie_en_cours: false }]);
    if (error) {
        console.error(error);
        return res.status(500).send("Erreur lors de l'ajout du plongeur");
    }
    res.redirect("/gestion-plongeurs");
});

app.post("/modifier-plongeur/:id", async (req, res) => {
    const { id } = req.params;
    const { niveau } = req.body;
    const { error } = await supabase
        .from("plongeurs")
        .update({ niveau })
        .eq("id", id);
    if (error) {
        console.error("Erreur de modification :", error);
        return res.status(500).send("Erreur lors de la modification");
    }
    res.send("Plongeur modifié");
});

app.delete("/supprimer-plongeur/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("plongeurs").delete().eq("id", id);
    if (error) {
        console.error("Erreur de suppression :", error);
        return res.status(500).send("Erreur lors de la suppression");
    }
    res.send("Plongeur supprimé");
});

app.delete("/retirer-plongeur-de-palanquee/:palanqueeId/:plongeurId", async (req, res) => {
    const { palanqueeId, plongeurId } = req.params;

    console.log(`🛠️ Requête reçue pour retirer le plongeur ${plongeurId} de la palanquée ${palanqueeId}`);

    const { error } = await supabase
        .from("palanquees_plongeurs")  // Vérifie bien le nom exact de la table
        .delete()
        .match({ palanquee_id: palanqueeId, plongeur_id: plongeurId });

    if (error) {
        console.error("❌ Erreur suppression :", error);
        return res.status(500).send("Erreur lors du retrait du plongeur de la palanquée");
    }

    console.log("✅ Plongeur retiré avec succès !");
    res.send("Plongeur retiré de la palanquée");
});




// Gestion des sorties
app.get("/gestion-sorties", async (req, res) => {
    try {
        // Récupérer les sorties avec les plongeurs associés
        const { data: sorties, error: errorSorties } = await supabase.from(
            "sorties",
        ).select(`
                id, 
                lieu, 
                date_debut, 
                date_fin, 
                plongeurs_sorties (plongeur_id)
            `);

        if (errorSorties) throw errorSorties;

        // Récupérer tous les plongeurs
        const { data: plongeurs, error: errorPlongeurs } = await supabase
            .from("plongeurs")
            .select("*");

        if (errorPlongeurs) throw errorPlongeurs;

        // Transformer les sorties pour inclure la liste des plongeurs associés
        const sortiesAvecPlongeurs = sorties.map((sortie) => ({
            ...sortie,
            plongeurs_count: sortie.plongeurs_sorties
                ? sortie.plongeurs_sorties.length
                : 0,
            plongeurs_associes: sortie.plongeurs_sorties
                ? sortie.plongeurs_sorties.map((ps) => ps.plongeur_id)
                : [],
        }));

        res.render("gestion_sorties", {
            sorties: sortiesAvecPlongeurs,
            plongeurs,
        });
    } catch (error) {
        console.error("Erreur lors de la récupération des données:", error);
        res.status(500).send("Erreur serveur");
    }
});

// Route pour la page de sélection des sorties
app.get("/selection-sorties", async (req, res) => {
    try {
        // Récupérer les sorties disponibles
        const { data: sorties, error } = await supabase
            .from("sorties")
            .select("id, lieu, date_debut, date_fin"); // Sélectionner les colonnes que vous souhaitez afficher

        if (error) throw error;

        // Loguer les données récupérées pour débogage
        console.log("Sorties récupérées :", sorties);

        // Rendre la vue de sélection des sorties avec les données récupérées
        res.render("selection_sorties", { sorties });
    } catch (error) {
        console.error("Erreur lors de la récupération des sorties :", error);
        res.status(500).send("Erreur serveur");
    }
});

app.get("/get-plongeurs-sortie/:id", async (req, res) => {
    try {
        const sortieId = req.params.id;

        // Requête pour récupérer les plongeurs associés à la sortie
        const { data: plongeursAssocies, error } = await supabase
            .from("plongeurs_sorties")  // Utilise le bon nom de la table
            .select("plongeur_id")
            .eq("sortie_id", sortieId);

        if (error) throw error;

        // Extraire uniquement les IDs des plongeurs
        const plongeursIds = plongeursAssocies.map(p => p.plongeur_id);

        res.json({ plongeurs_associes: plongeursIds });
    } catch (error) {
        console.error("Erreur lors de la récupération des plongeurs associés :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});




// Gérer la route pour la gestion des palanquées avec la sortie sélectionnée
app.get("/gestion-palanquees", async (req, res) => {
    const sortieId = req.query.sortie; // Récupérer l'ID de la sortie sélectionnée
    const date = req.query.date; // Récupérer la date sélectionnée

    // Vérifiez que les variables sont présentes
    if (!sortieId || !date) {
        return res.status(400).send("Sortie ou date manquante.");
    }

    try {
        // Récupérer les plongées associées à la sortie et à la date
        const { data: plongees, error: plongeesError } = await supabase
            .from("plongees")
            .select("*")
            .eq("sortie_id", sortieId)
            .eq("date", date);

        if (plongeesError) throw plongeesError;

        // Récupérer les palanquées associées à chaque plongée
        const palanqueesPromises = plongees.map(plongee =>
            supabase
                .from("palanquees")
                .select("*")
                .eq("plongee_id", plongee.id) // Assurez-vous que "id" est le bon champ
        );

        // Exécutez toutes les promesses et attendez les résultats
        const palanqueesResults = await Promise.all(palanqueesPromises);
        
        // Aplatir le tableau des résultats pour avoir une liste de palanquées
        const palanquees = palanqueesResults.flatMap(result => result.data || []);

        // Rendre la vue de gestion des palanquées avec les plongées et palanquées récupérées
        res.render("gestion_palanquees", { plongees, palanquees, sortieId, date });
    } catch (error) {
        console.error("Erreur lors de la récupération des plongées ou palanquées :", error);
        res.status(500).send("Erreur serveur");
    }
});






app.post("/ajouter-sortie", async (req, res) => {
    const { lieu, date_debut, date_fin } = req.body; // Ajout de date_fin

    const { error } = await supabase
        .from("sorties")
        .insert([{ lieu, date_debut, date_fin }]); // Ajout de date_fin

    if (error) {
        console.error("Erreur d'ajout de sortie :", error);
        return res.status(500).send("Erreur lors de l'ajout de la sortie");
    }
    res.redirect("/gestion-sorties");
});

app.delete("/supprimer-sortie/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("sorties").delete().eq("id", id);
    if (error) {
        console.error("Erreur de suppression de sortie :", error);
        return res.status(500).send("Erreur lors de la suppression");
    }
    res.send("Sortie supprimée");
});

app.post("/ajouter-plongeurs-a-sortie", async (req, res) => {
    console.log("Données reçues :", req.body);
    let { sortie_id, plongeurs } = req.body;

    if (!sortie_id || !plongeurs) {
        return res.status(400).send("Sortie ou plongeurs non sélectionnés.");
    }

    try {
        // S'assurer que plongeurs est un tableau
        if (!Array.isArray(plongeurs)) {
            plongeurs = [plongeurs];
        }

        // Valider que tous les plongeurs sont des UUID valides
        const plongeursIds = plongeurs.filter(
            (id) => typeof id === "string" && id.length === 36,
        );

        if (plongeursIds.length === 0) {
            return res.redirect("/gestion-sorties"); // Aucun plongeur valide à ajouter
        }

        // Récupérer les plongeurs déjà associés à cette sortie
        const { data: plongeursExistants, error: errorPlongeursExistants } =
            await supabase
                .from("plongeurs_sorties")
                .select("plongeur_id")
                .eq("sortie_id", sortie_id);

        if (errorPlongeursExistants) throw errorPlongeursExistants;

        // Extraire les IDs des plongeurs déjà ajoutés
        const plongeursDejaAjoutes = new Set(
            plongeursExistants.map((ps) => ps.plongeur_id),
        );

        // Filtrer pour ne garder que les nouveaux plongeurs qui ne sont pas déjà ajoutés
        const nouveauxPlongeurs = plongeursIds.filter(
            (id) => !plongeursDejaAjoutes.has(id),
        );

        if (nouveauxPlongeurs.length === 0) {
            return res.redirect("/gestion-sorties"); // Rien à ajouter
        }

        // Préparer les nouvelles entrées
        const newEntries = nouveauxPlongeurs.map((plongeur_id) => ({
            sortie_id: sortie_id, // doit être une chaîne UUID
            plongeur_id: plongeur_id, // doit être une chaîne UUID
        }));

        console.log("Nouvelle entrée à insérer :", newEntries); // Affiche les nouvelles entrées

        // Insérer uniquement les nouveaux plongeurs
        const { error } = await supabase
            .from("plongeurs_sorties")
            .insert(newEntries);

        if (error) {
            console.error(
                "Erreur lors de l'ajout des plongeurs :",
                error.message,
            );
            return res
                .status(500)
                .send(
                    "Erreur lors de l'ajout des plongeurs : " + error.message,
                );
        }

        console.log("Plongeurs ajoutés :", newEntries); // Log des plongeurs ajoutés
        res.redirect("/gestion-sorties");
    } catch (error) {
        console.error("Erreur lors de l'ajout des plongeurs :", error);
        res.status(500).send("Erreur interne du serveur.");
    }
});

app.get("/plongees/:sortieId/:date", async (req, res) => {
    const { sortieId, date } = req.params; // Vous avez déjà fait cela
    try {
        // Récupérer les plongées pour la date et la sortie sélectionnées
        const { data: plongees, error } = await supabase
            .from("plongees")
            .select("*")
            .eq("date", date)
            .eq("sortie_id", sortieId);

        if (error) throw error;

        // Rendre la vue avec les plongées récupérées
        res.render("gestion_plongees", { plongees, date, sortieId }); // Assurez-vous que date est passée ici
    } catch (error) {
        console.error("Erreur lors de la récupération des plongées :", error);
        res.status(500).send("Erreur serveur");
    }
});
app.get("/api/plongees/:sortieId/:date", async (req, res) => {
    const { sortieId, date } = req.params;
    try {
        // Récupérer les plongées pour la date et la sortie sélectionnées
        const { data: plongees, error } = await supabase
            .from("plongees")
            .select("*")
            .eq("date", date)
            .eq("sortie_id", sortieId);

        if (error) throw error;

        console.log("✅ Plongées envoyées en JSON :", plongees); // 🔥 Debug
        res.json(plongees); // ✅ On envoie un JSON
    } catch (error) {
        console.error("❌ Erreur serveur :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});


app.post("/api/ajouter-plongee", async (req, res) => {
try {
    const { sortie_id, date } = req.body;
    console.log("Données reçues pour ajout de plongée:", req.body);

    if (!sortie_id || !date) {
        return res.status(400).json({ error: "Données manquantes pour créer la plongée" });
    }

    // 🔍 Récupérer le nombre actuel de plongées pour cette sortie
    const { data: existingPlongees, error: countError } = await supabase
        .from("plongees")
        .select("id", { count: "exact" }) // On compte le nombre de plongées
        .eq("sortie_id", sortie_id);

    if (countError) {
        console.error("Erreur lors de la récupération des plongées :", countError);
        return res.status(500).json({ error: "Erreur lors de la récupération des plongées" });
    }

    const numero = (existingPlongees.length || 0) + 1; // Numéro = total existant + 1

    // 🔽 Insérer la nouvelle plongée avec le bon numéro
    const { data, error } = await supabase
        .from("plongees")
        .insert([{ numero, sortie_id, date }])
        .select("*");

    if (error) {
        console.error("Erreur lors de l'insertion :", error);
        return res.status(500).json({ error: "Erreur lors de l'insertion" });
    }

    console.log("✅ Plongée ajoutée :", data[0]);
    return res.json(data[0]);
} catch (error) {
    console.error("🚨 Erreur serveur :", error);
    return res.status(500).json({ error: "Erreur serveur lors de l'ajout de la plongée" });
}
});


app.post("/api/mettre-a-jour-site", async (req, res) => {
try {
    const { id, site } = req.body;

    if (!id || !site) {
        return res.status(400).json({ error: "ID et site requis" });
    }

    console.log(
        `🔄 Mise à jour du site pour la plongée ${id} -> Nouveau site: ${site}`,
    );

    // Mise à jour dans Supabase
    const { data, error } = await supabase
        .from("plongees") // Remplace par le bon nom de la table
        .update({ site: site }) // Vérifie que la colonne "site" existe bien
        .eq("id", id);

    if (error) {
        throw error;
    }

    console.log(`✅ Plongée ${id} mise à jour avec le site: ${site}`);
    res.json({ success: true, data });
} catch (error) {
    console.error("❌ Erreur mise à jour site:", error);
    res.status(500).json({
        error: "Erreur serveur lors de la mise à jour du site",
    });
}
});

app.post("/api/update-site", async (req, res) => {
const { plongeeId, site } = req.body;

console.log(
    `🔄 Mise à jour du site pour la plongée ${plongeeId} -> Nouveau site: ${site}`,
);

try {
    const { data, error } = await supabase
        .from("plongees")
        .update({ site: site })
        .eq("id", plongeeId);

    if (error) {
        throw error;
    }

    console.log("✅ Mise à jour réussie !");
    res.status(200).json({ success: true, data });
} catch (err) {
    console.error("❌ Erreur mise à jour site:", err);
    res.status(500).json({ error: err.message });
}
});

app.get("/gestion_palanquees", async (req, res) => {
const plongeeId = req.query.id; // ID de la plongée

if (!plongeeId) {
    return res.status(400).send("ID de plongée manquant");
}

try {
    // 1. Trouver l'ID de la sortie associée à cette plongée
    const { data: plongee, error: plongeeError } = await supabase
        .from("plongees")
        .select("sortie_id")
        .eq("id", plongeeId)
        .single();

    if (plongeeError || !plongee) {
        return res.status(404).send("Plongée non trouvée.");
    }

    const sortieId = plongee.sortie_id;

    // 2. Récupérer les informations de la sortie (lieu)
    const { data: sortie, error: sortieError } = await supabase
        .from("sorties")
        .select("id, lieu")
        .eq("id", sortieId)
        .single();

    if (sortieError || !sortie) {
        return res.status(404).send("Sortie non trouvée.");
    }

    // 3. Récupérer les plongeurs de cette sortie
    const { data: plongeursSortie, error: plongeursError } = await supabase
        .from("plongeurs_sorties")
        .select("plongeur_id")
        .eq("sortie_id", sortieId);

    if (plongeursError) {
        return res
            .status(500)
            .send("Erreur lors de la récupération des plongeurs.");
    }

    if (!plongeursSortie.length) {
        return res
            .status(404)
            .send("Aucun plongeur trouvé pour cette sortie.");
    }

    // 4. Récupérer les détails des plongeurs
    const plongeurIds = plongeursSortie.map((p) => p.plongeur_id);

    const { data: plongeurs, error: detailsError } = await supabase
        .from("plongeurs")
        .select("id, nom, niveau")
        .in("id", plongeurIds);

    if (detailsError) {
        return res
            .status(500)
            .send(
                "Erreur lors de la récupération des détails des plongeurs.",
            );
    }

    // 5. Envoyer les données à la vue
    res.render("gestion_palanquees", { plongee: sortie, plongeurs });
} catch (error) {
    console.error("Erreur serveur:", error);
    res.status(500).send("Erreur interne du serveur.");
}
});

/*// Route pour récupérer les palanquées associées à une plongée
app.get("/get_palanquees", async (req, res) => {
const plongeeId = req.query.plongee_id; // ID de la plongée

if (!plongeeId) {
    return res.status(400).send("ID de plongée manquant");
}

try {
    // Récupérer les palanquées associées à la plongée
    const { data: palanquees, error: palanqueesError } = await supabase
        .from("palanquees") // Remplace par le nom de ta table de palanquées
        .select("id, nom, plongeurs") // Assure-toi que les colonnes correspondent
        .eq("plongee_id", plongeeId);

    if (palanqueesError) {
        return res.status(500).send("Erreur lors de la récupération des palanquées.");
    }

    // Renvoie les palanquées au client
    res.json(palanquees);
} catch (error) {
    console.error("Erreur serveur:", error);
    res.status(500).send("Erreur interne du serveur.");
}
});*/

app.get("/get_palanquees/:plongee_id", async (req, res) => {
    const { plongee_id } = req.params;

    try {

        // Récupérer les palanquées pour la plongée donnée
        const { data: palanquees, error: palanqueesError } = await supabase
        .from("palanquees")
        .select(`
            id, nom, profondeur, duree, paliers,
            palanquees_plongeurs (plongeur_id, plongeurs (id, nom, niveau))
        `)
        .eq("plongee_id", plongee_id);
    

        if (palanqueesError) throw new Error(palanqueesError.message);

        // Récupérer l'ID de la sortie associée à la plongée
        const { data: plongee, error: plongeeError } = await supabase
            .from("plongees")
            .select("sortie_id")
            .eq("id", plongee_id)
            .single();

        if (plongeeError) throw new Error(plongeeError.message);

        const sortie_id = plongee.sortie_id;

        // Récupérer les plongeurs de cette sortie
        const { data: plongeursSorties, error: plongeursSortiesError } = await supabase
            .from("plongeurs_sorties")
            .select("plongeur_id")
            .eq("sortie_id", sortie_id);

        if (plongeursSortiesError) throw new Error(plongeursSortiesError.message);

        const plongeursIds = plongeursSorties.map(ps => ps.plongeur_id);

        let plongeurs = [];
        if (plongeursIds.length > 0) {
            const { data, error } = await supabase
                .from("plongeurs")
                .select("*")
                .in("id", plongeursIds);

            if (error) throw new Error(error.message);
            plongeurs = data;
        }

        let plongeursPalanquees = [];
        if (palanquees.length > 0) {
            const { data, error } = await supabase
                .from("palanquees_plongeurs")
                .select("plongeur_id")
                .in("palanquee_id", palanquees.map(p => p.id));

            if (error) throw new Error(error.message);
            plongeursPalanquees = data;
        }

        // Filtrer les plongeurs qui ne sont pas dans une palanquée
        const plongeursInPalanquees = plongeursPalanquees.map(pp => pp.plongeur_id);
        const plongeursDisponibles = plongeurs.filter(plongeur => !plongeursInPalanquees.includes(plongeur.id));

        res.status(200).json({ palanquees, plongeurs: plongeursDisponibles });

    } catch (error) {
        console.error("❌ Erreur lors de la récupération des données :", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post("/enregistrer_palanquee", async (req, res) => {
    console.log("On entre dans enregistrer_palanquee");
    const palanquees = req.body;

    console.log("Données reçues :", JSON.stringify(palanquees, null, 2));

    if (!Array.isArray(palanquees) || palanquees.length === 0) {
        return res.status(400).json({ error: "Données invalides ou incomplètes" });
    }

    const erreurs = [];
    const plongee_id = palanquees[0]?.plongee_id;
    console.log("ID reçu dans app.js : ", plongee_id);

    if (!plongee_id) {
        return res.status(400).json({ error: "Plongée ID manquant" });
    }

    try {
        // 🔍 Charger toutes les palanquées existantes pour cette plongée
        const { data: existingPalanquees, error: fetchError } = await supabase
            .from("palanquees")
            .select("id, nom, profondeur, duree, paliers")
            .eq("plongee_id", plongee_id);

        if (fetchError) {
            console.error("Erreur lors de la récupération des palanquées existantes : ", fetchError);
            return res.status(500).json({ error: "Erreur récupération des palanquées existantes" });
        }

        const existingPalanqueesMap = new Map(existingPalanquees.map(p => [p.id, p]));
        console.log("Palanquées existantes pour cette plongée : ", existingPalanquees);

        // 🔄 Traiter les palanquées reçues
        const updatedPalanquees = [];
        for (const palanqueeData of palanquees) {
            console.log("palanqueeData : ", palanqueeData);
            let { id, nom, profondeur, duree, paliers, plongeurs } = palanqueeData;
            console.log("ID après palanqueeData", id);

            // Vérification des données reçues pour chaque palanquée
            if (!nom || !plongeurs || plongeurs.length === 0) {
                erreurs.push({ palanquee: nom, message: "Données invalides ou incomplètes" });
                continue;
            }

            if (id) {
                console.log("ID reçu pour l'enregistrement : ", id);
                // 🔍 Vérifier si l'ID existe bien en base
                if (existingPalanqueesMap.has(id)) {
                    console.log("on identifie que l'id existe");
                    // ✅ Mise à jour de la palanquée
                    const { error: updateError } = await supabase
                        .from("palanquees")
                        .update({ nom, profondeur, duree, paliers })
                        .eq("id", id);

                    if (updateError) {
                        erreurs.push({ palanquee: nom, message: updateError.message });
                        continue;
                    }
                    updatedPalanquees.push({ id, plongeurs });
                } else {
                    // ❌ L'ID envoyé ne correspond à rien → Problème, on ne fait rien
                    erreurs.push({ palanquee: nom, message: "ID invalide, palanquée inexistante" });
                    continue;
                }
            } else {
                console.log("On ne reçoit pas un id", id);
                // ✅ Insertion d'une nouvelle palanquée
                const { data: newPalanquee, error: insertError } = await supabase
                    .from("palanquees")
                    .insert([{ plongee_id, nom, profondeur, duree, paliers }])
                    .select()
                    .single();

                if (insertError) {
                    erreurs.push({ palanquee: nom, message: insertError.message });
                } else {
                    console.log("Nouvelle palanquée insérée avec ID : ", newPalanquee.id);
                    updatedPalanquees.push({ id: newPalanquee.id, plongeurs });
                }
            }
        }

        // Mise à jour des plongeurs pour les palanquées
        for (const palanquee of updatedPalanquees) {
            const { id, plongeurs } = palanquee;
            // ✅ Mise à jour des plongeurs (évite les doublons)
            const { error: deleteError } = await supabase
                .from("palanquees_plongeurs")
                .delete()
                .eq("palanquee_id", id);

            if (deleteError) {
                erreurs.push({ palanquee: palanquee.nom, message: deleteError.message });
                continue;
            }

            if (plongeurs.length > 0) {
                const plongeursData = plongeurs.map(plongeur_id => ({
                    palanquee_id: id,
                    plongeur_id
                }));

                const { error: plongeursError } = await supabase
                    .from("palanquees_plongeurs")
                    .insert(plongeursData);

                if (plongeursError) {
                    erreurs.push({ palanquee: palanquee.nom, message: plongeursError.message });
                }
            }
        }

        if (erreurs.length > 0) {
            console.log("Certaines palanquées ont rencontré des erreurs : ", erreurs);
            return res.status(207).json({ message: "Certaines palanquées ont rencontré des erreurs", erreurs });
        }

        res.status(201).json({ message: "Toutes les palanquées ont été enregistrées avec succès !" });
    } catch (error) {
        console.error("Erreur inattendue : ", error);
        res.status(500).json({ error: error.message });
    }
});








app.delete("/supprimer_palanquee/:id", async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ error: "ID de palanquée manquant" });
    }

    try {
        // Supprimer d'abord les relations dans `palanquees_plongeurs`
        await supabase.from("palanquees_plongeurs").delete().eq("palanquee_id", id);

        // Ensuite, supprimer la palanquée elle-même
        const { error } = await supabase.from("palanquees").delete().eq("id", id);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ message: "Palanquée supprimée avec succès" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Récupérer les palanquées avec leurs plongeurs
app.get("/palanquees", async (req, res) => {
try {
    let { data: palanquees, error } = await supabase
        .from("palanquees")
        .select("*");

    if (error) throw error;

    for (let palanquee of palanquees) {
        let { data: palanqueesPlongeurs } = await supabase
            .from("palanquees_plongeurs")
            .select("plongeur_id")
            .eq("palanquee_id", palanquee.id);

        let plongeurIds = palanqueesPlongeurs.map(p => p.plongeur_id);

        let { data: plongeurs } = await supabase
            .from("plongeurs")
            .select("*")
            .in("id", plongeurIds);

        palanquee.plongeurs = plongeurs;
    }

    res.render("palanquees", { palanquees });
} catch (error) {
    console.error("Erreur:", error);
    res.status(500).send("Erreur serveur");
}
});

// Récupérer les paramètres des palanquées
app.get("/parametres_palanquees", async (req, res) => {
console.log("📢 Route /parametres_palanquees appelée avec query:", req.query);

const plongeeId = req.query.id;

if (!plongeeId) {
    console.error("❌ Erreur: Aucun ID de plongée fourni dans l'URL.");
    return res.status(400).send("ID de plongée manquant.");
}

try {
    let { data: palanquees, error: errorPalanquees } = await supabase
        .from("palanquees")
        .select("*")
        .eq("plongee_id", plongeeId); // On filtre par plongeeId

    if (errorPalanquees) throw errorPalanquees;

    if (!palanquees || palanquees.length === 0) {
        console.log("⚠️ Aucune palanquée trouvée pour cette plongée !");
        return res.render("parametres_palanquees", { palanquees: [] });
    }

    for (let palanquee of palanquees) {
        if (!palanquee.id || typeof palanquee.id !== "string") {
            console.error(`❌ Erreur: palanquee.id est invalide (${palanquee.id})`);
            continue;
        }

        console.log(`🔎 ID de la palanquée récupérée: ${palanquee.id}`);

        let { data: palanqueesPlongeurs, error: errorLien } = await supabase
            .from("palanquees_plongeurs")
            .select("plongeur_id")
            .eq("palanquee_id", palanquee.id);

        if (errorLien) {
            console.error(`❌ Erreur récupération plongeurs pour ${palanquee.id}:`, errorLien);
            continue;
        }

        console.log(`📝 Liens palanquée-plongeurs:`, JSON.stringify(palanqueesPlongeurs, null, 2));

        const plongeurIds = palanqueesPlongeurs.map(p => p.plongeur_id);

        if (plongeurIds.length === 0) {
            console.log(`⚠️ Aucun plongeur trouvé pour ${palanquee.id}`);
            palanquee.plongeurs = [];
            continue;
        }

        let { data: plongeurs, error: errorPlongeurs } = await supabase
            .from("plongeurs")
            .select("*")
            .in("id", plongeurIds);

        if (errorPlongeurs) {
            console.error(`❌ Erreur récupération détails plongeurs pour ${palanquee.id}:`, errorPlongeurs);
            continue;
        }

        console.log(`👨‍👩‍👧‍👦 Plongeurs trouvés pour ${palanquee.id}:`, JSON.stringify(plongeurs, null, 2));

        palanquee.plongeurs = plongeurs;
    }

    res.render("parametres_palanquees", { palanquees, plongeeId });
} catch (error) {
    console.error("❌ Erreur lors de la récupération des palanquées:", error);
    res.status(500).send("Erreur serveur");
}
});

app.post("/sauvegarder_parametres", async (req, res) => {
console.log("📩 Données reçues pour sauvegarde :", req.body);

const { id, profondeur, duree, paliers } = req.body;

if (!id || profondeur === undefined || duree === undefined || paliers === undefined) {
    return res.status(400).json({ error: "Données invalides ou incomplètes." });
}

try {
    let { error } = await supabase
        .from("palanquees")
        .update({ profondeur, duree, paliers })
        .eq("id", id);

    if (error) {
        console.error(`❌ Erreur mise à jour palanquée ${id}:`, error);
        return res.status(500).json({ error: "Erreur serveur lors de la mise à jour." });
    }

    console.log(`✅ Paramètres de la palanquée ${id} mis à jour avec succès.`);
    res.json({ success: true, message: "Paramètres enregistrés avec succès !" });
} catch (error) {
    console.error("❌ Erreur serveur :", error);
    res.status(500).json({ error: "Erreur serveur." });
}
});

app.get("/plongee_info", async (req, res) => {
const plongeeId = req.query.id; // Récupération de l'ID de plongée depuis la requête

if (!plongeeId) {
    return res.status(400).json({ error: "ID de plongée manquant." });
}

try {
    let { data, error } = await supabase
        .from("plongees")
        .select("date, site")
        .eq("id", plongeeId)
        .single(); // Récupère un seul enregistrement

    if (error) throw error;

    if (!data) {
        return res.status(404).json({ error: "Plongée non trouvée." });
    }

    // Formater la date en "jour mois année"
    const options = { day: "2-digit", month: "long", year: "numeric" };
    const dateFormattee = new Date(data.date).toLocaleDateString("fr-FR", options);

    res.json({ date: dateFormattee, site: data.site });
} catch (err) {
    console.error("Erreur récupération plongée:", err);
    res.status(500).json({ error: "Erreur serveur." });
}
});

app.get("/modif_palanquee/:id", async (req, res) => {
const palanqueeId = req.params.id;
console.log("Chargement de la palanquée avec ID :", palanqueeId);

try {
    let { data: palanquee, error: palanqueeError } = await supabase
        .from("palanquees")
        .select("*")
        .eq("id", palanqueeId)
        .single();

    if (palanqueeError) {
        console.error("Erreur lors de la récupération de la palanquée:", palanqueeError);
        throw palanqueeError;
    }

    console.log("Palanquée trouvée :", palanquee);

    // Récupérer la liste des plongeurs
    let { data: plongeurs, error: plongeursError } = await supabase
        .from("palanquees_plongeurs")
        .select("plongeurs (id, nom, niveau)")
        .eq("palanquee_id", palanqueeId);

    if (plongeursError) {
        console.error("Erreur lors de la récupération des plongeurs:", plongeursError);
        throw plongeursError;
    }

    const plongeursListe = plongeurs.map(p => p.plongeurs);

    res.render("modif_palanquee", { palanquee, plongeurs: plongeursListe });
} catch (error) {
    console.error("Erreur lors du chargement de la palanquée:", error);
    res.status(500).send("Erreur serveur.");
}
});


app.post('/supprimer_palanquee', async (req, res) => {
const { palanqueeId } = req.body;

// Supprimer les plongeurs associés
await supabase
    .from('palanquees_plongeurs')
    .delete()
    .eq('palanquee_id', palanqueeId);

// Supprimer la palanquée
const { error } = await supabase
    .from('palanquees')
    .delete()
    .eq('id', palanqueeId);

if (error) {
    return res.status(500).send("Erreur lors de la suppression de la palanquée.");
}

res.send("Palanquée et plongeurs supprimés avec succès.");
});

app.post("/ajouter-plongee", async (req, res) => {
    try {
        const { sortie_id, date } = req.body; // Ajoute sortie_id

        if (!sortie_id || !date) {
            return res.status(400).json({ error: "sortie_id et date sont requis" });
        }

        const { data, error } = await supabase
            .from("plongees")
            .insert([{ sortie_id, date }]);

        if (error) {
            console.error("Erreur Supabase :", error);
            return res.status(500).json({ error: error.message });
        }

        res.status(201).json({ message: "Plongée ajoutée", data });
    } catch (err) {
        console.error("Erreur serveur :", err);
        res.status(500).json({ error: "Erreur interne du serveur" });
    }
});


app.get("/test", (req, res) => {
console.log("✅ Route de test appelée !");
res.send("Test OK");
});



// Démarrage du serveur
app.listen(port, () => {
console.log(`✅ Serveur démarré sur http://localhost:${port}`);
});

