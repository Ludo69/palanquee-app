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

// Gérer la route pour la gestion des palanquées avec la sortie sélectionnée
app.get("/gestion-palanquees", async (req, res) => {
    const sortieId = req.query.sortie; // Récupérer l'ID de la sortie sélectionnée
    const date = req.query.date; // Récupérer la date sélectionnée

    // Vérifiez que les variables sont présentes
    if (!sortieId || !date) {
        return res.status(400).send("Sortie ou date manquante.");
    }

    try {
        // Ici, vous pouvez récupérer les plongées associées à la sortie et à la date
        const { data: plongees, error } = await supabase
            .from("plongees")
            .select("*")
            .eq("sortie_id", sortieId)
            .eq("date", date);

        if (error) throw error;

        // Rendre la vue de gestion des palanquées avec les plongées récupérées
        res.render("gestion_palanquees", { plongees, sortieId, date });
    } catch (error) {
        console.error("Erreur lors de la récupération des plongées :", error);
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
            .from("plongees") // Remplace par le bon nom de ta table
            .update({ site: site }) // Assure-toi que la colonne 'site' existe bien
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

app.post("/enregistrer_palanquee", async (req, res) => {
    const palanquees = req.body;

    if (!Array.isArray(palanquees) || palanquees.length === 0) {
        return res.status(400).json({ error: "Données invalides ou incomplètes" });
    }

    const erreurs = []; // Stocker les erreurs

    try {
        for (const palanqueeData of palanquees) {
            const { plongee_id, nom, profondeur, duree, paliers, plongeurs } = palanqueeData;

            if (!plongee_id || !nom || !plongeurs || plongeurs.length === 0) {
                erreurs.push({ palanquee: nom, message: "Données invalides ou incomplètes" });
                continue; // Passer à la palanquée suivante au lieu d'arrêter tout le processus
            }

            const { data: palanquee, error: palanqueeError } = await supabase
                .from("palanquees")
                .insert([{ plongee_id, nom, profondeur, duree, paliers }])
                .select()
                .single();

            if (palanqueeError) {
                erreurs.push({ palanquee: nom, message: palanqueeError.message });
                continue;
            }

            const palanquee_id = palanquee.id;
            const plongeursData = plongeurs.map(plongeur_id => ({
                palanquee_id,
                plongeur_id
            }));

            const { error: plongeursError } = await supabase
                .from("palanquees_plongeurs")
                .insert(plongeursData);

            if (plongeursError) {
                erreurs.push({ palanquee: nom, message: plongeursError.message });
            }
        }

        // Vérifier s'il y a des erreurs et envoyer une réponse appropriée
        if (erreurs.length > 0) {
            return res.status(207).json({ message: "Certaines palanquées n'ont pas pu être enregistrées", erreurs });
        }

        res.status(201).json({ message: "Toutes les palanquées ont été enregistrées avec succès !" });
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
        console.log("📋 Palanquées récupérées:", JSON.stringify(palanquees, null, 2));

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




app.get("/test", (req, res) => {
    console.log("✅ Route de test appelée !");
    res.send("Test OK");
});



// Démarrage du serveur
app.listen(port, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${port}`);
});

