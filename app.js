const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const https = require("https");
const fs = require("fs");
const path = require("path");
const app = express();
const pdfDir = path.join(__dirname, "public", "pdf");
const nodemailer = require("nodemailer");


// Vérifier si le dossier existe, sinon le créer
if (!fs.existsSync(pdfDir)) {
    console.log("📂 Dossier 'public/pdf' inexistant, création...");
    fs.mkdirSync(pdfDir, { recursive: true });
}

// Configuration de Supabase
const supabaseUrl = "https://xoiyziphxfkfxfawcafm.supabase.co";
const supabaseKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvaXl6aXBoeGZrZnhmYXdjYWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwODQ3MTMsImV4cCI6MjA1NTY2MDcxM30.tY-3BgdAtSuv1ScGOgnimQEsLnk1mbnN9A2jYatsaNE";
const supabase = createClient(supabaseUrl, supabaseKey);

// Charger les variables d'environnement en fonction de l'environnement
if (process.env.NODE_ENV === 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '.env.production') });
} else {
    require('dotenv').config({ path: path.resolve(__dirname, '.env.development') });
}

// Charger les certificats SSL
const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH)
};

const host = '0.0.0.0'; // Utiliser '0.0.0.0' pour écouter sur toutes les interfaces
const port = process.env.PORT || 3000;

console.log('Variables d\'environnement au démarrage :', JSON.stringify(process.env, null, 2));
// Vérifiez que les variables d'environnement sont bien chargées
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SSL_KEY_PATH:', process.env.SSL_KEY_PATH);
console.log('SSL_CERT_PATH:', process.env.SSL_CERT_PATH);
console.log('HOST:', process.env.HOST);
console.log('PORT:', process.env.PORT);

// Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
    //console.log("Requête reçue:", req.method, req.url);
    //console.log("Headers:", req.headers);
    //console.log("Body brut:", req.body);
    next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// Routes
app.get("/", (req, res) => {
    res.render("index");
});

// PDF
app.get("/generate-pdf", async (req, res) => {
    const { plongeeId } = req.query;

    if (!plongeeId) {
        return res.status(400).json({ error: "L'ID de la plongée est requis." });
    }

    try {
        //console.log("🔍 ID de la plongée reçu :", plongeeId);

        // Récupérer les infos de la plongée avec jointure pour obtenir le nom et niveau du DP
        const { data: plongee, error: plongeeError } = await supabase
            .from("plongees")
            .select("nomdp, date, site, plongeurs(niveau, nom), heure_debut")
            .eq("id", plongeeId)
            .single();

        if (plongeeError || !plongee) {
            console.error("❌ Erreur lors de la récupération de la plongée :", plongeeError);
            throw new Error("Impossible de récupérer les données de la plongée.");
        }

        //console.log("✅ Données plongée récupérées :", plongee);

        // Récupérer les palanquées associées à cette plongée
        const { data: palanquees, error: palanqueesError } = await supabase
            .from("palanquees")
            .select("id, nom, profondeur, duree, paliers, prof_max, duree_max, type")
            .eq("plongee_id", plongeeId);

        if (palanqueesError) {
            console.error("❌ Erreur lors de la récupération des palanquées :", palanqueesError);
            throw new Error("Impossible de récupérer les palanquées.");
        }

        //console.log("✅ Palanquées récupérées :", palanquees);

        // Formater la date en "jour mois année"
        const datePlongee = new Date(plongee.date);
        const options = { day: "numeric", month: "long", year: "numeric" };
        const dateFormatee = datePlongee.toLocaleDateString("fr-FR", options);
        // Formater l'heure en "HHhMM"
        let heureFormattee = "Heure inconnue";
        if (plongee.heure_debut) {
            const [heures, minutes] = plongee.heure_debut.split(":");
            heureFormattee = `${heures}h${minutes}`;
        }
        const dateEtHeure = `${dateFormatee} - ${heureFormattee}`;

        console.log("Date formatée :", dateFormatee);
        console.log("Heure formatée :", heureFormattee);


        // Récupérer les plongeurs pour chaque palanquée
        for (let palanquee of palanquees) {
            const { data: palanqueesPlongeurs, error: plongeursError } = await supabase
                .from("palanquees_plongeurs")
                .select("plongeur_id, niveau_plongeur_historique")  // Ajoute niveau_historique ici
                .eq("palanquee_id", palanquee.id);
        
            if (plongeursError) {
                console.error("❌ Erreur lors de la récupération des plongeurs pour la palanquée :", plongeursError);
                continue;
            }
        
            // Récupérer les informations des plongeurs (noms seulement)
            const plongeurIds = palanqueesPlongeurs.map(p => p.plongeur_id);
            if (plongeurIds.length > 0) {
                const { data: plongeurs, error: plongeursDataError } = await supabase
                    .from("plongeurs")
                    .select("id, nom")  // On ne prend plus le niveau actuel ici
                    .in("id", plongeurIds);
        
                if (plongeursDataError) {
                    console.error("❌ Erreur lors de la récupération des détails des plongeurs :", plongeursDataError);
                    continue;
                }
        
                // Fusionner les données: nom du plongeur + niveau historique
                palanquee.plongeurs = plongeurs.map(plongeur => {
                    const correspondance = palanqueesPlongeurs.find(p => p.plongeur_id === plongeur.id);
                    return {
                        ...plongeur,
                        niveau: correspondance.niveau_plongeur_historique  // Utilise le niveau historique
                    };
                });
            }
        }

        // Construire les données du PDF
        const data = {
            nomDP: plongee.plongeurs.nom,
            qualificationDP: plongee.plongeurs.niveau,
            site: plongee.site || "Site inconnu",
            date: dateEtHeure,
            palanquees: palanquees || []
        };

        // Création du document PDF
        // ✅ Initialisation correcte de `datePlongeePDF`
        const datePlongeePDF = new Date(plongee.date);
        const now = new Date();
        datePlongeePDF.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

        
        // 🔹 Création du document PDF
        const doc = new PDFDocument({ margin: 40 });
                const formattedDate = datePlongeePDF.toLocaleString("fr-FR", {
            year: "2-digit",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }).replace(/\D/g, "-"); // Remplace les séparateurs par des tirets
        const fileName = `parametres_plongee_${formattedDate}.pdf`; 
        const filePath = path.join(__dirname, "public", "pdf", fileName);

       // const filePath = path.join(__dirname, "public", fileName); // ✅ filePath défini AVANT utilisation

        const stream = fs.createWriteStream(filePath); // ✅ Maintenant, filePath est bien défini


        console.log("📄 Génération du PDF :", filePath); // Debug pour vérifier le chemin
        doc.pipe(stream);


        // Ajouter le logo (assure-toi que le chemin est correct)
        const logoPath = __dirname + "/public/images/scc28.jpeg"; 

        const logoWidth = 100;  // Largeur du logo
        const logoHeight = 40;  // Hauteur du logo
        const margin = 20;      // Marge entre le logo et le rectangle

        // Position du logo (en haut à gauche)
        doc.image(logoPath, 50, 50, { width: logoWidth, height: logoHeight });

        // Position du rectangle (juste à droite du logo)
        const rectX = 50 + logoWidth + margin; // Démarre après le logo avec une marge
        const rectWidth = 500 - logoWidth - margin; // Largeur ajustée en fonction du logo
        const rectY = 50; // Même hauteur que le logo
        const rectHeight = 40; // Hauteur du rectangle (même que le logo pour alignement)

        // Dessiner le rectangle gris
        doc.rect(rectX, rectY, rectWidth, rectHeight).fill("blue");

        // Texte du titre
        const text = "FICHE DE SECURITE";

        // Centrage vertical (ajuster selon la hauteur du texte)
        const textY = rectY + (rectHeight / 3); 

        // Ajouter le texte bien centré dans le rectangle
        doc.fillColor("white")
        .fontSize(20) // Taille ajustée pour éviter de dépasser
        .text(text, rectX, textY, { align: "center", width: rectWidth }); // Centrage parfait

        
        

        // Réinitialiser la couleur du texte à noir pour le reste du document
        doc.fillColor("black");  // Texte noir pour le reste du document

        // Continuer avec le reste du contenu (par exemple, l'affichage des informations)
        doc.moveDown(1);

        // Définir une position verticale fixe (par exemple, à 150 pour les deux éléments)
        const yPosition = doc.y;

        // Plongée du : [date] à gauche avec une taille de police plus petite
        doc.fontSize(12).text(`Date : ${data.date}`, 40, yPosition, { width: 250, align: "left" });

        // Nom du DP : [nomdp] à droite avec une taille de police plus petite
        doc.fontSize(12).text(`Nom du DP : ${data.nomDP}`, 300, yPosition, { width: 250, align: "left" });

        // Après avoir écrit ces deux éléments, on peut déplacer vers le bas pour la prochaine ligne
        doc.moveDown(1);  // Passe à la ligne suivante après avoir écrit les deux textes

        // Définir une position verticale fixe (par exemple, à 150 pour les deux éléments)
        const zPosition = doc.y;

        // Plongée du : [date] à gauche avec une taille de police plus petite
        doc.fontSize(12).text(`Site de Plongée : ${data.site}`, 40, zPosition, { width: 250, align: "left" });

        // Nom du DP : [nomdp] à droite avec une taille de police plus petite
        doc.fontSize(12).text(`Qualification du DP : ${data.qualificationDP}`, 300, zPosition, { width: 250, align: "left" });

        // Après avoir écrit ces deux éléments, on peut déplacer vers le bas pour la prochaine ligne
        doc.moveDown(1);  // Passe à la ligne suivante après avoir écrit les deux textes

        // Séparateur
        doc.lineWidth(0.5).moveTo(40, doc.y).lineTo(600, doc.y).stroke();
        doc.moveDown(1);

        // 📌 Définition du titre "Liste des palanquées"
        const text2 = "Liste des palanquées";

        // 📌 Augmenter la taille de police et centrer précisément
        doc.fontSize(14).text(text2, 0, doc.y, { width: doc.page.width, align: "center", underline: true });


        // Remettre la police à 10 pour le reste du document
        doc.fontSize(10);

        // Passer à la ligne suivante
        doc.moveDown(1);

        // Séparateur
        doc.lineWidth(0.5).moveTo(40, doc.y).lineTo(600, doc.y).stroke();
        doc.moveDown(1.5);

        // 📌 Position de l'en-tête supplémentaire
        const headerY = doc.y - 14; // Ajustement de la hauteur pour meilleure lisibilité

        // 🟢 "Consigne maxi DP" (centré sur les colonnes Prof. Max et Durée Max)
        doc.fontSize(10).text("Consigne maxi DP", 270, headerY, { width: 100, align: "center" });

        // 🟢 "Réalisés" (centré sur les colonnes Prof. et Durée)
        doc.text("Réalisés", 360, headerY, { width: 100, align: "center" });

        // 🔹 Séparateur vertical bien aligné entre "Consigne maxi DP" et "Réalisés"
        doc.moveTo(365, headerY - 4).lineTo(365, doc.y + 12).stroke();

        // Remettre la police à 10 pour le reste du document
        doc.fontSize(10);

        // Séparateur
        doc.lineWidth(0.5).moveTo(40, doc.y).lineTo(600, doc.y).stroke();


        // 🔹 Ajout d'un espace avant les titres des colonnes
        doc.moveDown(1);

        // 📌 Nouvelles largeurs des colonnes
        const columnWidths = [110, 140, 45, 45, 45, 45, 50, 60]; // 🆕 Réduction des colonnes "Prof." et "Durée"

        // 📌 Positionner correctement les en-têtes des colonnes
        const tableTop = doc.y;
        doc.text("Nom", 10, tableTop, { width: columnWidths[0], align: "center" });
        doc.text("Plongeurs", 125, tableTop, { width: columnWidths[1], align: "center" });
        doc.text("Prof.", 275, tableTop, { width: columnWidths[2], align: "center" });
        doc.text("Durée", 320, tableTop, { width: columnWidths[3], align: "center" });
        doc.text("Prof.", 365, tableTop, { width: columnWidths[4], align: "center" });
        doc.text("Durée", 410, tableTop, { width: columnWidths[5], align: "center" });
        doc.text("Paliers", 465, tableTop, { width: columnWidths[6], align: "center" });
        doc.text("Type plongée", 525, tableTop, { width: columnWidths[7], align: "center" });

        // 📌 Séparateur sous les titres
        doc.lineWidth(0.5).moveTo(40, doc.y).lineTo(600, doc.y).stroke();
        doc.moveDown(1);

        // 📌 Définition des positions X des traits verticaux
        const columnLines = [120, 270, 320, 365, 410, 460, 520, 590]; // 🆕 Ajustement des traits

        // 📌 Boucle pour remplir le tableau des palanquées
        data.palanquees.forEach((palanquee) => {
            let startY = doc.y; // Position initiale

            // 🟢 Colonne "Nom"
            doc.text(palanquee.nom || "-", 20, startY, { width: columnWidths[0], align: "center" });

            // 🟢 Colonne "Plongeurs" (avec les guides en premier)
                let plongeurY = startY;
                if (palanquee.plongeurs && palanquee.plongeurs.length > 0) {
                    // Trier les plongeurs: d'abord les guides (GP, E2-E4), puis les autres
                    const plongeursTries = [...palanquee.plongeurs].sort((a, b) => {
                        const isGuideA = ['GP', 'E2', 'E3', 'E4'].includes(a.niveau);
                        const isGuideB = ['GP', 'E2', 'E3', 'E4'].includes(b.niveau);
                        
                        if (isGuideA && !isGuideB) return -1; // a (guide) avant b
                        if (!isGuideA && isGuideB) return 1;  // b (guide) avant a
                        return 0; // ordre égal
                    });

                    plongeursTries.forEach(plongeur => {
                        // Ajoute un symbole (★) si c'est un guide
                        const isGuide = ['GP', 'E2', 'E3', 'E4'].includes(plongeur.niveau);
                        const prefix = isGuide ? '* ' : '';
                        doc.text(`${prefix}${plongeur.nom || "-"} (${plongeur.niveau || "-"})`, 
                                130, plongeurY, 
                                { width: columnWidths[1], align: "left" });
                        plongeurY += 14;
                    });
                } else {
                    doc.text("Aucun plongeur", 130, plongeurY, { width: columnWidths[1], align: "left" });
                    plongeurY += 14;
                }

            // 📌 Ajustement de la hauteur de fin pour éviter les chevauchements
            let endY = Math.max(startY + 20, plongeurY);

            // 🟢 Colonnes suivantes (avec alignement centré)
            doc.text((palanquee.prof_max ?? "-").toString(), 270, startY, { width: columnWidths[2], align: "center" });
            doc.text((palanquee.duree_max ?? "-").toString(), 320, startY, { width: columnWidths[3], align: "center" });
            doc.text((palanquee.profondeur ?? "-").toString(), 365, startY, { width: columnWidths[4], align: "center" });
            doc.text((palanquee.duree ?? "-").toString(), 410, startY, { width: columnWidths[5], align: "center" });
            doc.text(palanquee.paliers || "Aucun", 465, startY, { width: columnWidths[6], align: "center" });
            doc.text(palanquee.type || "-", 520, startY, { width: columnWidths[7], align: "center" });

            // 🔹 Ajuster `doc.y` pour la prochaine palanquée
            doc.y = endY;

            // 🔹 Ligne de séparation sous chaque palanquée
            doc.lineWidth(0.5).moveTo(40, doc.y).lineTo(600, doc.y).stroke();
            doc.moveDown(1);
        });

        // 📌 Dessiner les traits verticaux après avoir affiché toutes les palanquées
        columnLines.forEach(x => {
            doc.moveTo(x, tableTop).lineTo(x, doc.y).stroke();
        });




         

        doc.end();

        //const datePlongeePDF = new Date(plongee.date); // Date de la plongée (sans heure)
        //const now = new Date(); // Heure actuelle
        //doc.pipe(stream);



        // Ajouter l'heure actuelle à la date de la plongée
        datePlongeePDF.setHours(now.getHours(), now.getMinutes(), now.getSeconds());





        // 🔹 Fin de la génération et envoi de la réponse
        stream.on("finish", () => {
            res.json({ url: `/pdf/${fileName}` });
        });


    } catch (error) {
        console.error("❌ Erreur lors de la génération du PDF :", error);
        console.error(error.stack); // Affiche l'erreur complète
        res.status(500).json({ error: "Erreur serveur lors de la génération du PDF." });
    }
});











// Gestion des plongeurs
app.get("/gestion-plongeurs", async (req, res) => {
    try {
        const { data, error } = await supabase.from("plongeurs").select("*");

        if (error) {
            console.error("Erreur lors de la récupération des plongeurs:", error);
            return res.status(500).send("Erreur serveur");
        }

        // Trier les plongeurs par ordre alphabétique sur le nom
        data.sort((a, b) => a.nom.localeCompare(b.nom));

        // Passer la liste triée ET le nombre de plongeurs à la vue
        res.render("gestion_plongeurs", { 
            plongeurs: data,
            nombrePlongeurs: data.length // Ajout du comptage
        });
    } catch (error) {
        console.error("Erreur lors de la récupération des plongeurs:", error);
        res.status(500).send("Erreur serveur");
    }
});

// Route pour récupérer les plongeurs ayant un niveau E3 ou E4 pour une sortie spécifique
app.get("/api/get-plongeurs", async (req, res) => {
    const { sortieId, categorie } = req.query; // Récupère l'ID de la sortie et le niveau (categorie) depuis les paramètres de la requête

    // Validation du niveau, il doit être "E3" ou "E4"
    if (categorie && !["E3", "E4"].includes(categorie)) {
        return res.status(400).json({ error: "Le niveau doit être E3 ou E4." });
    }

    try {
        // Récupérer les plongeurs associés à la sortie via plongeurs_sorties
        let query = supabase
            .from("plongeurs_sorties")
            .select("plongeur_id")  // Sélectionner uniquement les plongeur_id (avec le "s" enlevé)
            .eq("sortie_id", sortieId);  // Filtrer par sortie_id

        // Si une catégorie (niveau) est fournie, filtrer les plongeurs par niveau
        let plongeursIdsQuery;
        if (categorie) {
            plongeursIdsQuery = await supabase
                .from("plongeurs")
                .select("id")
                .eq("niveau", categorie);  // Filtrer les plongeurs par niveau
        }

        // Si une catégorie a été spécifiée, on récupère les ids des plongeurs correspondant à cette catégorie
        let plongeursIds = [];
        if (plongeursIdsQuery && plongeursIdsQuery.data) {
            plongeursIds = plongeursIdsQuery.data.map(plongeur => plongeur.id);
        }

        // Si des plongeurs de la catégorie sont trouvés, ajouter ce filtre
        if (plongeursIds.length > 0) {
            query = query.in("plongeur_id", plongeursIds);  // Utilise "plongeur_id" qui est la colonne correcte
        }

        const { data: plongeursSorties, error: plongéesError } = await query;

        if (plongéesError) {
            console.error("Erreur lors de la récupération des plongeurs associés à la sortie:", plongéesError);
            return res.status(500).json({ error: "Erreur lors de la récupération des plongeurs associés." });
        }

        if (!plongeursSorties || plongeursSorties.length === 0) {
            return res.status(404).json({ error: "Aucun plongeur associé à cette sortie." });
        }

        // Extraire les plongeur_ids uniquement une seule fois
        const idsPlongeurs = plongeursSorties.map(ps => ps.plongeur_id);

        // Récupérer les détails des plongeurs à partir de leurs ids
        const { data: plongeurs, error: plongeursError } = await supabase
            .from("plongeurs")
            .select("id, nom, niveau")
            .in("id", idsPlongeurs); // Filtrer par les ids des plongeurs

        if (plongeursError) {
            console.error("Erreur lors de la récupération des plongeurs:", plongeursError);
            return res.status(500).json({ error: "Erreur lors de la récupération des plongeurs." });
        }

        // Si tout va bien, on renvoie les plongeurs
        res.json(plongeurs);
    } catch (error) {
        console.error("Erreur serveur:", error);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

app.post('/api/update-dp', async (req, res) => {
    const { plongeeId, nomDP } = req.body;

    try {
        // Utilisation de Supabase pour mettre à jour l'entrée
        const { data, error } = await supabase
            .from('plongees')  // Table 'plongees'
            .update({ nomdp: nomDP })  // Mettre à jour la colonne 'nomdp' (tout en minuscules)
            .eq('id', plongeeId);  // Condition où l'id correspond à plongeeId

        if (error) {
            throw error;  // Si une erreur survient
        }

        res.status(200).json({ message: "Plongée mise à jour avec succès.", data });
    } catch (error) {
        console.error("❌ Erreur lors de la mise à jour :", error);
        res.status(500).json({ error: "Erreur lors de la mise à jour du DP." });
    }
});


app.get('/api/plongeur/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('plongeurs')
            .select('nom, niveau') // ✅ On récupère aussi le niveau
            .eq('id', id)
            .single();

        if (error) throw error;

        res.status(200).json(data);  // Retourner nom + niveau
    } catch (error) {
        console.error("❌ Erreur lors de la récupération du plongeur :", error);
        res.status(500).json({ error: "Erreur lors de la récupération du plongeur" });
    }
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
        const { data: sorties, error: sortiesError } = await supabase
            .from("sorties")
            .select("id, lieu, date_debut, date_fin"); // Sélectionner les colonnes que vous souhaitez afficher

        if (sortiesError) throw sortiesError;

        // Récupérer les dates de plongées
        const { data: plongees, error: plongeesError } = await supabase
            .from("plongees")
            .select("date");

        if (plongeesError) throw plongeesError;

        // Loguer les données récupérées pour débogage
        //console.log("Sorties récupérées :", sorties);
        //console.log("Plongées récupérées :", plongees);

        // Rendre la vue de sélection des sorties avec les données récupérées
        res.render("selection_sorties", { sorties, plongees });
    } catch (error) {
        console.error("Erreur lors de la récupération des sorties ou des plongées :", error);
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
    //console.log("Données reçues :", req.body);
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

        //console.log("Nouvelle entrée à insérer :", newEntries); // Affiche les nouvelles entrées

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

        //console.log("Plongeurs ajoutés :", newEntries); // Log des plongeurs ajoutés
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

        //console.log("✅ Plongées envoyées en JSON :", plongees); // 🔥 Debug
        res.json(plongees); // ✅ On envoie un JSON
    } catch (error) {
        console.error("❌ Erreur serveur :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});


app.post("/api/ajouter-plongee", async (req, res) => {
    try {
        const { sortie_id, date } = req.body;

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
        const plongeeData = { numero, sortie_id, date };

        // Si nomdp n'est pas fourni, on le met explicitement à null (pas "null" en chaîne, mais un véritable null)
        plongeeData.nomdp = null;

        // Insérer la plongée dans la table 'plongees'
        const { data, error } = await supabase
            .from("plongees")
            .insert([plongeeData])
            .select("*");

        if (error) {
            console.error("Erreur lors de l'insertion :", error);
            return res.status(500).json({ error: "Erreur lors de l'insertion" });
        }

        return res.json(data[0]); // Renvoi la plongée ajoutée
    } catch (error) {
        console.error("🚨 Erreur serveur :", error);
        return res.status(500).json({ error: "Erreur serveur lors de l'ajout de la plongée" });
    }
});

app.get("/api/get-dp-name", async (req, res) => {
    const { plongeeId } = req.query;  // Récupère l'ID de la plongée depuis les paramètres de la requête

    if (!plongeeId) {
        return res.status(400).json({ error: "Le paramètre plongeeId est requis." });
    }

    try {
        // Requête pour récupérer le nom du DP pour une plongée donnée
        const { data, error } = await supabase
            .from("plongees")
            .select("nomdp")
            .eq("id", plongeeId)
            .single();  // Récupérer un seul enregistrement

        if (error) {
            console.error("Erreur lors de la récupération du nom du DP:", error);
            return res.status(500).json({ error: "Erreur lors de la récupération du nom du DP." });
        }

        // Si les données sont trouvées, on renvoie le nom du DP
        if (data && data.nomdp) {
            res.json({ nomdp: data.nomdp });
        } else {
            res.status(404).json({ error: "Nom du DP non trouvé pour cette plongée." });
        }
    } catch (error) {
        console.error("Erreur serveur:", error);
        res.status(500).json({ error: "Erreur serveur." });
    }
});


app.post("/api/mettre-a-jour-site", async (req, res) => {
try {
    const { id, site } = req.body;

    if (!id || !site) {
        return res.status(400).json({ error: "ID et site requis" });
    }

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

try {
    const { data, error } = await supabase
        .from("plongees")
        .update({ site: site })
        .eq("id", plongeeId);

    if (error) {
        throw error;
    }

    //console.log("✅ Mise à jour réussie !");
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
            palanquees_plongeurs (plongeur_id, niveau_plongeur_historique, plongeurs (id, nom, niveau))
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
    //console.log("On entre dans enregistrer_palanquee");
    const palanquees = req.body;
    //console.log("Données reçues :", JSON.stringify(palanquees, null, 2));

    if (!Array.isArray(palanquees) || palanquees.length === 0) {
        return res.status(400).json({ error: "Données invalides ou incomplètes" });
    }

    const erreurs = [];
    const plongee_id = palanquees[0]?.plongee_id;
    //console.log("ID reçu dans app.js : ", plongee_id);

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
        //console.log("Palanquées existantes pour cette plongée : ", existingPalanquees);

        // 🔄 Traiter les palanquées reçues
        const updatedPalanquees = [];
        for (const palanqueeData of palanquees) {
            //console.log("Palanquée reçue : ", palanqueeData);
            let { id, nom, profondeur, duree, paliers, plongeurs } = palanqueeData;
            //console.log("ID après palanqueeData", id);

            // Vérification des données reçues pour chaque palanquée
            if (!nom || !plongeurs || plongeurs.length === 0) {
                erreurs.push({ palanquee: nom, message: "Données invalides ou incomplètes" });
                continue;
            }

            if (id) {
                //console.log("ID reçu pour l'enregistrement : ", id);
                // 🔍 Vérifier si l'ID existe bien en base
                if (existingPalanqueesMap.has(id)) {
                    //console.log("on identifie que l'id existe");
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
                //console.log("On ne reçoit pas un id", id);
                // ✅ Insertion d'une nouvelle palanquée
                const { data: newPalanquee, error: insertError } = await supabase
                    .from("palanquees")
                    .insert([{ plongee_id, nom, profondeur, duree, paliers }])
                    .select()
                    .single();

                if (insertError) {
                    erreurs.push({ palanquee: nom, message: insertError.message });
                } else {
                    //console.log("Nouvelle palanquée insérée avec ID : ", newPalanquee.id);
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
                const plongeursData = await Promise.all(plongeurs.map(async (plongeur_id) => {
                    // Récupérer les informations du plongeur (nom, niveau, et niveau historique)
                    const { data: plongeur, error: plongeurError } = await supabase
                        .from("plongeurs")
                        .select("nom, niveau")
                        .eq("id", plongeur_id)
                        .single();
        
                    if (plongeurError) {
                        erreurs.push({ plongeur: plongeur_id, message: plongeurError.message });
                        return null; // On saute ce plongeur si une erreur se produit
                    }
        
                    // Retourner les données pour l'insertion dans palanquees_plongeurs
                    return {
                        palanquee_id: id,
                        plongeur_id,
                        nom_plongeur: plongeur.nom,   // Ajouter le nom du plongeur
                        niveau_plongeur: plongeur.niveau, // Ajouter le niveau actuel du plongeur
                        niveau_plongeur_historique: plongeur.niveau // Conserver l'historique du niveau
                    };
                }));
        
                // Filtrer les valeurs nulles si une erreur s'est produite
                const plongeursDataValid = plongeursData.filter(data => data !== null);
        
                // Insérer les plongeurs dans la table palanquees_plongeurs
                const { error: plongeursError } = await supabase
                    .from("palanquees_plongeurs")
                    .insert(plongeursDataValid);
        
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
    //console.log("📢 Route /parametres_palanquees appelée avec query:", req.query);

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

            //console.log(`🔎 ID de la palanquée récupérée: ${palanquee.id}`);

            let { data: palanqueesPlongeurs, error: errorLien } = await supabase
                .from("palanquees_plongeurs")
                .select("plongeur_id, niveau_plongeur_historique")
                .eq("palanquee_id", palanquee.id);

            if (errorLien) {
                console.error(`❌ Erreur récupération plongeurs pour ${palanquee.id}:`, errorLien);
                continue;
            }

            //console.log(`📝 Liens palanquée-plongeurs:`, JSON.stringify(palanqueesPlongeurs, null, 2));

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

            //console.log(`👨‍👩‍👧‍👦 Plongeurs trouvés pour ${palanquee.id}:`, JSON.stringify(plongeurs, null, 2));

            // Ajouter le niveau historique pour chaque plongeur
            palanquee.plongeurs = plongeurs.map(plongeur => {
                let palanqueesPlongeur = palanqueesPlongeurs.find(p => p.plongeur_id === plongeur.id);
                if (palanqueesPlongeur) {
                    plongeur.niveau_plongeur_historique = palanqueesPlongeur.niveau_plongeur_historique;
                }
                return plongeur;
            });
        }

        res.render("parametres_palanquees", { palanquees, plongeeId });
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des palanquées:", error);
        res.status(500).send("Erreur serveur");
    }
});


app.post("/sauvegarder_parametres", async (req, res) => {
    //console.log("📩 Données reçues pour sauvegarde :", req.body);

    const { id, profondeur, duree, paliers, type } = req.body;

    if (!id || profondeur === undefined || duree === undefined || paliers === undefined || !type) {
        return res.status(400).json({ error: "Données invalides ou incomplètes." });
    }

    try {
        let { error } = await supabase
            .from("palanquees")
            .update({ profondeur, duree, paliers, type }) // 🆕 Ajout de `type` ici
            .eq("id", id);

        if (error) {
            console.error(`❌ Erreur mise à jour palanquée ${id}:`, error);
            return res.status(500).json({ error: "Erreur serveur lors de la mise à jour." });
        }

        //console.log(`✅ Paramètres de la palanquée ${id} mis à jour avec succès.`);
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
        // Récupérer les données de la plongée
        let { data, error } = await supabase
            .from("plongees")
            .select("date, site, nomdp, heure_debut") // Récupère date, site et nomdp (ID du DP)
            .eq("id", plongeeId)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: "Plongée non trouvée." });
        }

        // Récupérer les informations de la plongée
        const dateFormattee = new Date(data.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
        const nomSitePlongee = data.site || "Site inconnu";

        // Initialiser nomDuDP et niveauDP avec des valeurs par défaut
        let nomDuDP = "DP non trouvé";
        let niveauDP = "Niveau non trouvé";

        // Si un ID de DP existe, récupérer le nom et le niveau du DP
        if (data.nomdp) {
            let { data: dpData, error: dpError } = await supabase
                .from("plongeurs")
                .select("nom, niveau") // Récupère le nom et le niveau du DP
                .eq("id", data.nomdp)
                .single(); // On prend un seul résultat, car il doit être unique

            if (dpError) {
                console.error("Erreur lors de la récupération du DP:", dpError);
            } else if (dpData) {
                nomDuDP = dpData.nom || "Nom du DP non trouvé"; // Si un nom est trouvé, on l'affiche
                niveauDP = dpData.niveau || "Niveau du DP non trouvé"; // Récupère également le niveau
            }
        }

        // Renvoyer les informations avec le nom et le niveau du DP
        res.json({
            date: dateFormattee,
            site: nomSitePlongee,
            nomdp: nomDuDP, // Inclure le nom du DP
            niveaudp: niveauDP, // Inclure le niveaux du DP
            heure_debut: data.heure_debut // Inclure l'heure de début
        });
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

app.post('/retirer-plongeur', async (req, res) => {
    const { plongeurId, sortieId } = req.body;

    //console.log("Données reçues:", req.body);

    if (!plongeurId || !sortieId) {
        return res.status(400).json({ success: false, message: "Plongeur ou sortie manquant." });
    }

    try {
        // Utiliser Supabase pour supprimer l'association dans la table plongeurs_sorties
        const { error } = await supabase
            .from('plongeurs_sorties')
            .delete()
            .eq('plongeur_id', plongeurId)
            .eq('sortie_id', sortieId);

        if (error) {
            console.error("Erreur lors de la suppression de l'association dans la base de données :", error);
            return res.status(500).json({ success: false, message: "Erreur serveur" });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error("Erreur lors de la suppression :", error);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
});

app.post("/api/set-dp", async (req, res) => {
    const { plongeeId, dpId } = req.body;

    if (!plongeeId || !dpId) {
        return res.status(400).json({ error: "Données manquantes" });
    }

    const { error } = await supabase
        .from("plongees")
        .update({ nomDP: dpId }) // Met à jour le DP
        .eq("id", plongeeId);

    if (error) {
        console.error("Erreur mise à jour DP :", error);
        return res.status(500).json({ error: "Erreur serveur" });
    }

    res.json({ success: true });
});

// Route pour gérer le webhook
app.post('/webhook', (req, res) => {
    console.log("Webhook reçu, corps de la requête:", req.body); // Log pour debug

    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).send("Erreur: Le corps de la requête est invalide.");
    }

    if (req.body.ref === 'refs/heads/main') {
        console.log('Mise à jour de la branche principale détectée.');

        const exec = require('child_process').exec;
        exec('/home/ludo/app/palanquee-app/deploy.sh', (error, stdout, stderr) => {
            if (error) {
                console.error(`Erreur d'exécution: ${stderr}`);
                return res.status(500).send("Erreur lors du déploiement.");
            }
            console.log(stdout);
            res.send("Déploiement réussi !");
        });
    } else {
        res.status(200).send("Aucun déploiement nécessaire.");
    }
});

app.delete("/delete-plongee/:id", async (req, res) => {
    const plongeeId = req.params.id;

    if (!plongeeId) {
        return res.status(400).json({ error: "ID de plongée manquant" });
    }

    try {
        const { error } = await supabase
            .from("plongees") // Remplace par le nom exact de ta table
            .delete()
            .eq("id", plongeeId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ success: true, message: "Plongée supprimée avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/enregistrer-consignes', async (req, res) => {
    const { palanquee_id, prof_max, duree_max } = req.body;

    if (!palanquee_id || !prof_max || !duree_max) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // 3️⃣ Mettre à jour Supabase
    const { error } = await supabase
        .from('palanquees')
        .update({ prof_max, duree_max })
        .eq('id', palanquee_id);

    if (error) {
        console.error("Erreur Supabase :", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }

    res.json({ success: true, message: "Consignes enregistrées avec succès !" });
});

// 🚀 Route API pour envoyer un email avec le PDF
app.post("/send-email", async (req, res) => {
    const { email, pdfUrl } = req.body;

    if (!email || !pdfUrl) {
        return res.status(400).json({ error: "Email et PDF requis" });
    }

    let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "ludosams@gmail.com",
            pass: "vjqy kriu sgcu qtlz" // ⚠️ Utilise un mot de passe d’application sécurisé
        }
    });

    let mailOptions = {
        from: '"Club de Plongée" <tonemail@gmail.com>',
        to: email,
        subject: "📄 Compte-rendu de plongée",
        text: "Bonjour,\n\nVoici le compte-rendu de votre plongée en pièce jointe.\n\nCordialement,\nL'équipe de plongée.",
        attachments: [
            {
                filename: "Compte-rendu-Plongée.pdf",
                path: pdfUrl // Utilise l'URL complète du PDF
            }
        ]
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log("📧 Email envoyé :", info.response);
        res.json({ success: true, message: "Email envoyé avec succès !" });
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'email :", error);
        res.status(500).json({ error: "Erreur lors de l'envoi de l'email" });
    }
});

app.post("/api/lancer-plongee", async (req, res) => {
    const { plongeeId, startTime } = req.body; // Récupérez startTime depuis le corps de la requête

    if (!plongeeId) {
        return res.status(400).json({ error: "ID de plongée manquant" });
    }

    try {
        // Utilisez startTime envoyé par le client ou générez-le ici
        const heureSQL = new Date().toLocaleTimeString("fr-FR", { hour12: false }); // "HH:MM:SS"

        const { data, error } = await supabase
            .from("plongees")
            .update({ heure_debut: heureSQL }) // Utilisez l'heure au format "HH:MM:SS"
            .eq("id", plongeeId);

        if (error) {
            throw error;
        }

        res.json({ success: true, message: "Plongée lancée avec succès", data });
    } catch (error) {
        console.error("Erreur lors de la mise à jour de l'heure de début :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Ajoutez cette nouvelle route dans votre fichier de routes (server.js ou app.js)
app.get('/api/stats', async (req, res) => {
    try {
        // Récupération du nombre réel de plongeurs
        const { count: plongeursCount } = await supabase
            .from('plongeurs')
            .select('*', { count: 'exact', head: true });

        // Récupération du nombre réel de sorties (adaptez selon votre table)
        const { count: sortiesCount } = await supabase
            .from('sorties')
            .select('*', { count: 'exact', head: true });

        // Récupération du nombre réel de palanquées (adaptez selon votre table)
        const { count: palanqueesCount } = await supabase
            .from('palanquees')
            .select('*', { count: 'exact', head: true });

        res.json({
            plongeurs: plongeursCount || 0,
            sorties: sortiesCount || 0,
            palanquees: palanqueesCount || 0
        });
    } catch (error) {
        console.error('Erreur stats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});



// Démarrer le serveur HTTPS
const server = https.createServer(options, app);

server.listen(port, host, () => {
    console.log(`Server is running on https://${host}:${port}`);
});