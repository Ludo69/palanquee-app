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
const cookieParser = require("cookie-parser");
const pdfDirectory = path.join(__dirname, 'public', 'pdf');


// Vérifier si le dossier existe, sinon le créer
if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || "https://xoiyziphxfkfxfawcafm.supabase.co";
//const supabaseKey = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvaXl6aXBoeGZrZnhmYXdjYWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwODQ3MTMsImV4cCI6MjA1NTY2MDcxM30.tY-3BgdAtSuv1ScGOgnimQEsLnk1mbnN9A2jYatsaNE";
const supabaseKey = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvaXl6aXBoeGZrZnhmYXdjYWZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDA4NDcxMywiZXhwIjoyMDU1NjYwNzEzfQ.17rw_NqaY6dJv5csuFuOBK9vLXZMcDSO1D2zeLUrh2U";
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

// Middleware
app.use(bodyParser.json({ limit: '10mb' })); // Pour JSON
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true })); // Pour les URL-encodées
app.use((req, res, next) => {
    next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use(cookieParser());
// Servir les fichiers PDF directement
app.use('/pdf', express.static(path.join(__dirname, 'public', 'pdf')));

// Middleware pour injecter Supabase dans les routes
app.locals.supabase = supabase;

// Middleware d'authentification
const requireAuth = async (req, res, next) => {
    try {
        // Version sécurisée avec vérification des cookies
        const token = req.headers.authorization?.split(' ')[1] || req.cookies?.auth;

        if (!token) {
            return res.redirect('/?redirected=true');
        }

        // Vérification du token avec Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) {
            console.error("Erreur de vérification du token:", error.message);
            return res.redirect('/?error=invalid_token');
        }

        // Récupération des infos supplémentaires
        const { data: userData } = await supabase
            .from('users')
            .select('club_id, role, clubs(name), email')
            .eq('id', user.id)
            .single();

        if (!userData) {
            return res.redirect('/?error=user_not_found');
        }

        // Ajout des infos utilisateur à la requête
        req.user = {
            ...user,
            club_id: userData.club_id,
            role: userData.role,
            club_name: userData.clubs.name,
            email: userData.email
        };

        next();
    } catch (error) {
        console.error("Erreur dans requireAuth:", error);
        res.redirect('/?error=auth_failed');
    }
};

// Middleware pour vérifier le rôle admin
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    next();
};
// Middleware qui s'exécute avant chaque route
app.use(async (req, res, next) => {
    try {
        // 1. Récupération de l'utilisateur
        const token = req.cookies?.auth;
        let user = null;

        if (token) {
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data?.user) {
                const { data: userData } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', data.user.id)
                    .single();

                if (userData) user = { ...data.user, ...userData };
            }
        }

        // 2. Injection automatique dans toutes les vues
        res.locals.user = user;
        res.locals.isAdmin = user?.role === 'admin';
        res.locals.roleClasses = {
            button: user?.role === 'admin' ? 'role-active' : 'role-inactive',
            visibility: user?.role === 'admin' ? 'visible' : 'invisible'
        };

    } catch (error) {
        console.error('Middleware auth error:', error);
        // Valeurs par défaut si erreur
        res.locals.roleClasses = {
            button: 'role-inactive',
            visibility: 'invisible'
        };
    } finally {
        next(); // Poursuit l'exécution
    }
});
// Routes
// Vérifié
app.get("/", async (req, res) => {
    try {
        // Récupération de l'utilisateur connecté
        const token = req.cookies?.auth;
        let user = null;

        if (token) {
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data.user) {
                // Récupération des infos supplémentaires si besoin
                const { data: userData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                user = {
                    ...data.user,
                    ...userData
                };
            }
        }

        res.render("index", {
            user: user // Passage explicite de la variable user
        });

    } catch (error) {
        console.error("Erreur:", error);
        res.render("index", { user: null });
    }
});

// Route de connexion
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Authentification
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // 2. Récupération infos supplémentaires
        const { data: user } = await supabase
            .from('users')
            .select('*, clubs(name)')
            .eq('id', data.user.id)
            .single();

        // 3. Réponse sécurisée
        res.cookie('auth', data.session.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                club: user.clubs.name
            }
        });

    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(401).json({ error: error.message });
    }
});

// Route de déconnexion
app.post('/logout', async (req, res) => {
    try {
        // 1. Suppression du cookie côté serveur
        res.clearCookie('auth', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        // 2. Invalidation du token avec Supabase (optionnel mais recommandé)
        const token = req.cookies.auth;
        if (token) {
            await supabase.auth.signOut(token);
        }

        // 3. Redirection vers la page d'accueil
        res.redirect('/'); // Redirection immédiate

    } catch (error) {
        console.error("Erreur lors de la déconnexion:", error);
        res.status(500).json({ error: "Erreur lors de la déconnexion" });
    }
});

// PDF
// Vérifié
app.get("/generate-pdf", async (req, res) => {
    function formatHeurePDF(heure) {
        try {
            if (!heure) return "Non définie";

            // Convertit en string et nettoie
            const heureStr = heure.toString().trim();

            // Vérifie les formats connus
            if (/^\d{1,2}h\d{2}$/.test(heureStr)) {
                return heureStr;
            }
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(heureStr)) {
                const [h, m] = heureStr.split(':');
                return `${parseInt(h, 10)}h${m.padStart(2, '0')}`;
            }

            return "Format invalide";
        } catch (error) {
            console.error("Erreur formatage heure:", error);
            return "Erreur";
        }
    }
    const { plongeeId } = req.query;

    if (!plongeeId) {
        return res.status(400).json({ error: "L'ID de la plongée est requis." });
    }

    try {

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

        // Récupérer les palanquées associées à cette plongée
        const { data: palanquees, error: palanqueesError } = await supabase
            .from("palanquees")
            .select("id, nom, profondeur, duree, paliers, prof_max, duree_max, type, heure_mise_a_leau")
            .eq("plongee_id", plongeeId);

        if (palanqueesError) {
            console.error("❌ Erreur lors de la récupération des palanquées :", palanqueesError);
            throw new Error("Impossible de récupérer les palanquées.");
        }

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
        //const dateEtHeure = `${dateFormatee} - ${heureFormattee}`;
        const dateEtHeure = `${dateFormatee}`;

        // Récupérer les plongeurs pour chaque palanquée
        for (let palanquee of palanquees) {
            const { data: palanqueesPlongeurs, error: plongeursError } = await supabase
                .from("palanquees_plongeurs")
                .select("plongeur_id, niveau_plongeur_historique, gaz_type")  // Ajoute niveau_historique ici
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
                        id: plongeur.id,
                        nom: plongeur.nom,
                        niveau: correspondance.niveau_plongeur_historique,
                        gaz: correspondance.gaz_type,
                        display: `${plongeur.nom} (${correspondance.niveau_plongeur_historique}) (${correspondance.gaz_type})`
                    };
                });

                // ✅ Ajoutez ICI le console.log pour vérifier
                console.log("Plongeurs formatés:", palanquee.plongeurs.map(p => p.display));
            }
        }

        // Construire les données du PDF
        const data = {
            nomDP: plongee.plongeurs?.nom || "Non défini",
            qualificationDP: plongee.plongeurs?.niveau || "Non défini",
            site: plongee.site || "Site inconnu",
            date: dateEtHeure,
            palanquees: palanquees.map(palanquee => ({  // Notez le nom complet 'palanquee' au lieu de 'p'
                ...palanquee,
                heureFormatee: palanquee.heure_mise_a_leau
                    ? palanquee.heure_mise_a_leau.substring(0, 5).replace(':', 'h')
                    : "Non définie"
            })) || []
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

        const stream = fs.createWriteStream(filePath); // ✅ Maintenant, filePath est bien défini
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
        const columnWidths = [110, 150, 35, 35, 45, 45, 50, 60]; // 🆕 Réduction des colonnes "Prof." et "Durée"

        // 📌 Positionner correctement les en-têtes des colonnes
        const tableTop = doc.y;
        doc.text("Nom", 10, tableTop, { width: columnWidths[0], align: "center" });
        doc.text("Plongeurs", 125, tableTop, { width: columnWidths[1], align: "center" });
        doc.text("Prof.", 290, tableTop, { width: columnWidths[2], align: "center" });
        doc.text("Durée", 330, tableTop, { width: columnWidths[3], align: "center" });
        doc.text("Prof.", 365, tableTop, { width: columnWidths[4], align: "center" });
        doc.text("Durée", 410, tableTop, { width: columnWidths[5], align: "center" });
        doc.text("Paliers", 465, tableTop, { width: columnWidths[6], align: "center" });
        doc.text("Type plongée", 525, tableTop, { width: columnWidths[7], align: "center" });

        // 📌 Séparateur sous les titres
        doc.lineWidth(0.5).moveTo(40, doc.y).lineTo(600, doc.y).stroke();
        doc.moveDown(1);

        // 📌 Définition des positions X des traits verticaux
        const columnLines = [120, 285, 330, 365, 410, 460, 520, 590]; // 🆕 Ajustement des traits
        // 📌 Boucle pour remplir le tableau des palanquées
        data.palanquees.forEach((palanquee) => {
            let startY = doc.y; // Position initiale

            // 🟢 Colonne "Nom"
            //doc.text(palanquee.nom || "-", 20, startY, { width: columnWidths[0], align: "center" });
            // Nom de la palanquée (taille 10)
            doc.fontSize(10)
                .text(palanquee.nom, 20, startY, {
                    width: columnWidths[0],
                    align: "center"
                });

            // Heure formatée (taille 8)
            const heureFormatee = palanquee.heure_mise_a_leau
                ? palanquee.heure_mise_a_leau.substring(0, 5).replace(':', 'h')
                : "Non définie";

            doc.fontSize(8)
                .text(`Départ : ${heureFormatee}`, 20, startY + 12, { // +12 pour l'espacement
                    width: columnWidths[0],
                    align: "center"
                });
            // Réinitialise la taille pour le reste
            doc.fontSize(10);
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
                    const isGuide = ['GP', 'E2', 'E3', 'E4'].includes(plongeur.niveau);
                    const prefix = isGuide ? '* ' : '';
                    const textePlongeur = plongeur.display
                        ? `${prefix}${plongeur.display}`
                        : `${prefix}${plongeur.nom} (${plongeur.niveau}) (${plongeur.gaz})`;

                    doc.text(textePlongeur, 130, plongeurY, {
                        width: columnWidths[1],
                        align: "left"
                    });
                    plongeurY += 14;
                });
            } else {
                doc.text("Aucun plongeur", 130, plongeurY, { width: columnWidths[1], align: "left" });
                plongeurY += 14;
            }

            // 📌 Ajustement de la hauteur de fin pour éviter les chevauchements
            let endY = Math.max(startY + 20, plongeurY);

            // 🟢 Colonnes suivantes (avec alignement centré)
            doc.text((palanquee.prof_max ?? "-").toString(), 290, startY, { width: columnWidths[2], align: "center" });
            doc.text((palanquee.duree_max ?? "-").toString(), 330, startY, { width: columnWidths[3], align: "center" });
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
// Vérifié
app.get("/gestion-plongeurs", requireAuth, async (req, res) => {
    try {
        // Accès au user authentifié via req.user
        //console.log("Utilisateur connecté:", req.user.email + " " + req.user.club_name + " " + req.user.role);

        // Seuls les plongeurs du club de l'utilisateur
        const { data, error } = await supabase
            .from("plongeurs")
            .select("*")
            .eq("club_id", req.user.club_id); // Filtrage par club

        if (error) throw error;

        // Tri alphabétique
        data.sort((a, b) => a.nom.localeCompare(b.nom));

        res.render("gestion_plongeurs", {
            plongeurs: data,
            nombrePlongeurs: data.length,
            user: req.user // Passage des infos utilisateur à la vue
        });

    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).render("error", {
            message: "Accès refusé ou erreur serveur"
        });
    }
});

// Route pour récupérer les plongeurs ayant un niveau E3 ou E4 pour une sortie spécifique
// Vérifié
app.get("/api/get-plongeurs", requireAuth, async (req, res) => {
    const { sortieId } = req.query;
    const categorie = req.query.categorie?.split(','); // Convertit "E3,E4" en ["E3", "E4"]

    try {
        // 1. Récupérer les IDs des plongeurs associés à la sortie
        const { data: plongeursSorties, error: sortieError } = await supabase
            .from("plongeurs_sorties")
            .select("plongeur_id")
            .eq("sortie_id", sortieId)
            .eq("club_id", req.user.club_id);

        if (sortieError) throw sortieError;
        if (!plongeursSorties?.length) return res.json([]);

        // 2. Récupérer les plongeurs avec filtre de niveau
        const plongeurIds = plongeursSorties.map(p => p.plongeur_id);

        let query = supabase
            .from("plongeurs")
            .select("id, nom, niveau")
            .in("id", plongeurIds)
            .eq("club_id", req.user.club_id);

        if (categorie) {
            query = query.in("niveau", categorie);
        }

        const { data: plongeurs, error } = await query;
        if (error) throw error;

        res.json(plongeurs || []);

    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Vérifié
app.post('/api/update-dp', requireAuth, async (req, res) => {
    const { plongeeId, nomDP } = req.body;

    try {
        // Mise à jour avec vérification du club_id
        const { data, error } = await supabase
            .from('plongees')
            .update({
                nomdp: nomDP
            })
            .eq('id', plongeeId)
            .eq('club_id', req.user.club_id);  // Filtre par club

        if (error) throw error;

        res.status(200).json({
            message: "Plongée mise à jour avec succès.",
            data
        });

    } catch (error) {
        console.error("Erreur mise à jour DP:", error);
        res.status(500).json({
            error: "Erreur lors de la mise à jour du DP."
        });
    }
});

// Vérifié
app.get('/api/plongeur/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('plongeurs')
            .select('nom, niveau')
            .eq('id', id)
            .eq('club_id', req.user.club_id)  // Filtre par club ajouté
            .single();

        if (error) throw error;

        res.status(200).json(data);  // Retourne nom + niveau

    } catch (error) {
        console.error("Erreur récupération plongeur:", error);
        res.status(500).json({ error: "Erreur lors de la récupération du plongeur" });
    }
});




// Vérifié
app.post("/ajouter-plongeur", requireAuth, async (req, res) => {
    const { nom, niveau } = req.body;

    try {
        const { error } = await supabase
            .from("plongeurs")
            .insert([{
                nom,
                niveau,
                sortie_en_cours: false,
                club_id: req.user.club_id  // Ajout du club_id
            }]);

        if (error) throw error;

        res.redirect("/gestion-plongeurs");

    } catch (error) {
        console.error("Erreur ajout plongeur:", error);
        res.status(500).send("Erreur lors de l'ajout du plongeur");
    }
});

// Vérifié
app.post("/modifier-plongeur/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { niveau } = req.body;

    // Vérification que l'utilisateur a un club_id
    if (!req.user.club_id) {
        return res.status(403).send("Accès refusé - aucun club associé");
    }

    const { error } = await supabase
        .from("plongeurs")
        .update({ niveau })
        .eq("id", id)
        .eq("club_id", req.user.club_id); // On s'assure qu'on ne modifie que les plongeurs du même club

    if (error) {
        console.error("Erreur de modification :", error);
        return res.status(500).send("Erreur lors de la modification");
    }

    res.send("Plongeur modifié");
});

app.delete("/supprimer-plongeur/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from("plongeurs")
        .delete()
        .eq("id", id)
        .eq("club_id", req.user.club_id); // Protection par club_id

    if (error) {
        console.error("Erreur de suppression :", error);
        return res.status(500).send("Erreur lors de la suppression");
    }

    res.send("Plongeur supprimé");
});

app.delete("/retirer-plongeur-de-palanquee/:palanqueeId/:plongeurId", requireAuth, async (req, res) => {
    const { palanqueeId, plongeurId } = req.params;

    // Suppression conditionnée par l'appartenance au même club
    const { error } = await supabase
        .from("palanquees_plongeurs")
        .delete()
        .match({
            palanquee_id: palanqueeId,
            plongeur_id: plongeurId,
            club_id: req.user.club_id  // Protection par club_id
        });

    if (error) {
        console.error("❌ Erreur suppression :", error);
        return res.status(500).send("Erreur lors du retrait du plongeur de la palanquée");
    }

    res.send("Plongeur retiré de la palanquée");
});




// Gestion des sorties
// Vérifié
app.get("/gestion-sorties", requireAuth, async (req, res) => {  // <-- Ajout de requireAuth
    try {
        // Récupérer l'ID du club de l'utilisateur connecté
        const clubId = req.user.club_id;

        // Récupérer les sorties du club uniquement
        const { data: sorties, error: errorSorties } = await supabase
            .from("sorties")
            .select(`
                id, 
                lieu, 
                date_debut, 
                date_fin, 
                plongeurs_sorties (plongeur_id)
            `)
            .eq('club_id', clubId);  // <-- Filtrage par club

        if (errorSorties) throw errorSorties;

        // Récupérer les plongeurs du club uniquement
        const { data: plongeurs, error: errorPlongeurs } = await supabase
            .from("plongeurs")
            .select("*")
            .eq('club_id', clubId);  // <-- Filtrage par club

        if (errorPlongeurs) throw errorPlongeurs;

        // Transformer les données
        const sortiesAvecPlongeurs = sorties.map((sortie) => ({
            ...sortie,
            plongeurs_count: sortie.plongeurs_sorties?.length || 0,
            plongeurs_associes: sortie.plongeurs_sorties?.map(ps => ps.plongeur_id) || [],
        }));

        res.render("gestion_sorties", {
            sorties: sortiesAvecPlongeurs,
            plongeurs,
            user: req.user  // <-- Passez les infos utilisateur à la vue
        });

    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).render("error", {
            message: "Accès refusé ou erreur serveur",
            user: req.user  // <-- Conservez la navigation même en erreur
        });
    }
});

// Route pour la page de sélection des sorties
// Vérifié
app.get("/selection-sorties", requireAuth, async (req, res) => {
    try {
        // 1. Vérifier que l'utilisateur a bien un club_id
        if (!req.user.club_id) {
            throw new Error("Accès refusé : utilisateur non affilié à un club");
        }

        // 2. Récupérer les sorties du club uniquement
        const { data: sorties, error: sortiesError } = await supabase
            .from("sorties")
            .select("id, lieu, date_debut, date_fin")
            .eq('club_id', req.user.club_id) // Filtrage par club
            .order('date_debut', { ascending: true }); // Tri par date

        if (sortiesError) throw sortiesError;

        // 3. Récupérer les plongées du club uniquement
        const { data: plongees, error: plongeesError } = await supabase
            .from("plongees")
            .select("date")
            .eq('club_id', req.user.club_id); // Filtrage par club

        if (plongeesError) throw plongeesError;

        // 4. Rendre la vue avec les données filtrées
        res.render("selection_sorties", {
            sorties: sorties || [],
            plongees: plongees || [],
            user: req.user // Passage des infos utilisateur à la vue
        });

    } catch (error) {
        console.error("Erreur:", error.message);
        res.status(500).render("error", {
            message: "Erreur lors de la récupération des données",
            error: process.env.NODE_ENV === 'development' ? error : null,
            user: req.user
        });
    }
});

// Vérifié
app.get("/get-plongeurs-sortie/:id", requireAuth, async (req, res) => {
    try {
        const sortieId = req.params.id;

        // Requête pour récupérer les plongeurs associés à la sortie du même club
        const { data: plongeursAssocies, error } = await supabase
            .from("plongeurs_sorties")
            .select("plongeur_id")
            .eq("sortie_id", sortieId)
            .eq("club_id", req.user.club_id);  // Protection par club_id

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
// Voir si utilisé ?
/*app.get("/gestion-palanquees", async (req, res) => {
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
});*/





// Vérifié
app.post("/ajouter-sortie", requireAuth, async (req, res) => {
    const { lieu, date_debut, date_fin } = req.body;

    // Ajout automatique du club_id de l'utilisateur
    const { error } = await supabase
        .from("sorties")
        .insert([{
            lieu,
            date_debut,
            date_fin,
            club_id: req.user.club_id  // Protection par club_id
        }]);

    if (error) {
        console.error("Erreur d'ajout de sortie :", error);
        return res.status(500).send("Erreur lors de l'ajout de la sortie");
    }
    res.redirect("/gestion-sorties");
});

app.delete("/supprimer-sortie/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from("sorties")
        .delete()
        .eq("id", id)
        .eq("club_id", req.user.club_id);  // Protection par club_id

    if (error) {
        console.error("Erreur de suppression de sortie :", error);
        return res.status(500).send("Erreur lors de la suppression");
    }

    res.send("Sortie supprimée");
});

// Vérifié
app.post("/ajouter-plongeurs-a-sortie", requireAuth, async (req, res) => {
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
            return res.redirect("/gestion-sorties");
        }

        // Vérifier que la sortie appartient au club de l'utilisateur
        const { data: sortie, error: sortieError } = await supabase
            .from("sorties")
            .select("id")
            .eq("id", sortie_id)
            .eq("club_id", req.user.club_id)
            .single();

        if (sortieError || !sortie) {
            return res.redirect("/gestion-sorties");
        }

        // Vérifier que les plongeurs appartiennent au club de l'utilisateur
        const { data: plongeursValides, error: plongeursError } = await supabase
            .from("plongeurs")
            .select("id")
            .in("id", plongeursIds)
            .eq("club_id", req.user.club_id);

        if (plongeursError) {
            return res.redirect("/gestion-sorties");
        }

        const plongeursValidesIds = plongeursValides.map(p => p.id);
        const plongeursAAjouter = plongeursIds.filter(id =>
            plongeursValidesIds.includes(id)
        );

        if (plongeursAAjouter.length === 0) {
            return res.redirect("/gestion-sorties");
        }

        // Récupérer les plongeurs déjà associés à cette sortie
        const { data: plongeursExistants, error: errorPlongeursExistants } =
            await supabase
                .from("plongeurs_sorties")
                .select("plongeur_id")
                .eq("sortie_id", sortie_id);

        if (errorPlongeursExistants) throw errorPlongeursExistants;

        // Filtrer pour ne garder que les nouveaux plongeurs
        const plongeursDejaAjoutes = new Set(
            plongeursExistants?.map((ps) => ps.plongeur_id) || []
        );

        const nouveauxPlongeurs = plongeursAAjouter.filter(
            (id) => !plongeursDejaAjoutes.has(id)
        );

        if (nouveauxPlongeurs.length === 0) {
            return res.redirect("/gestion-sorties");
        }

        // Préparer les nouvelles entrées avec club_id
        const newEntries = nouveauxPlongeurs.map((plongeur_id) => ({
            sortie_id,
            plongeur_id,
            club_id: req.user.club_id
        }));

        // Insérer les nouveaux plongeurs
        const { error } = await supabase
            .from("plongeurs_sorties")
            .insert(newEntries);

        if (error) throw error;

        res.redirect("/gestion-sorties");
    } catch (error) {
        console.error("Erreur lors de l'ajout des plongeurs :", error);
        res.redirect("/gestion-sorties");
    }
});

// Vérifié
app.get("/plongees/:sortieId/:date", requireAuth, async (req, res) => {
    const { sortieId, date } = req.params;
    try {
        // Récupérer les plongées pour la date et la sortie sélectionnées du même club
        const { data: plongees, error } = await supabase
            .from("plongees")
            .select("*")
            .eq("date", date)
            .eq("sortie_id", sortieId)
            .eq("club_id", req.user.club_id);  // Protection par club_id

        if (error) throw error;

        // Rendre la vue avec les plongées récupérées
        res.render("gestion_plongees", { plongees, date, sortieId });
    } catch (error) {
        console.error("Erreur lors de la récupération des plongées :", error);
        res.status(500).send("Erreur serveur");
    }
});


// Vérifié
app.get("/api/plongees/:sortieId/:date", requireAuth, async (req, res) => {
    const { sortieId, date } = req.params;
    try {
        // Récupération des plongées avec vérification du club_id
        const { data: plongees, error } = await supabase
            .from("plongees")
            .select("*")
            .eq("date", date)
            .eq("sortie_id", sortieId)
            .eq("club_id", req.user.club_id);  // Protection par club_id

        if (error) throw error;

        // Renvoie le JSON même si le tableau est vide (comportement original)
        res.json(plongees);
    } catch (error) {
        console.error("❌ Erreur serveur :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Vérifié
app.post("/api/ajouter-plongee", requireAuth, async (req, res) => {
    try {
        const { sortie_id, date } = req.body;

        if (!sortie_id || !date) {
            return res.status(400).json({ error: "Données manquantes pour créer la plongée" });
        }

        // Vérification que la sortie appartient au club de l'utilisateur
        const { data: sortie, error: sortieError } = await supabase
            .from("sorties")
            .select("id")
            .eq("id", sortie_id)
            .eq("club_id", req.user.club_id)
            .single();

        if (sortieError || !sortie) {
            return res.status(403).json({ error: "Sortie non trouvée ou accès non autorisé" });
        }

        // Comptage des plongées existantes pour cette sortie
        const { count, error: countError } = await supabase
            .from("plongees")
            .select("*", { count: "exact", head: true })
            .eq("sortie_id", sortie_id);

        if (countError) throw countError;

        const numero = (count || 0) + 1;

        // Insertion de la nouvelle plongée avec le club_id
        const { data, error } = await supabase
            .from("plongees")
            .insert([{
                numero,
                sortie_id,
                date,
                club_id: req.user.club_id,  // Ajout du club_id
                nomdp: null
            }])
            .select("*");

        if (error) throw error;

        return res.json(data[0]);
    } catch (error) {
        console.error("🚨 Erreur serveur :", error);
        return res.status(500).json({ error: "Erreur serveur lors de l'ajout de la plongée" });
    }
});

app.get("/api/get-dp-name", requireAuth, async (req, res) => {
    const { plongeeId } = req.query;

    if (!plongeeId) {
        return res.status(400).json({ error: "Le paramètre plongeeId est requis." });
    }

    try {
        // Requête pour récupérer le nom du DP avec vérification du club_id
        const { data, error } = await supabase
            .from("plongees")
            .select("nomdp")
            .eq("id", plongeeId)
            .eq("club_id", req.user.club_id)  // Protection par club_id
            .single();

        if (error) {
            console.error("Erreur lors de la récupération du nom du DP:", error);
            return res.status(500).json({ error: "Erreur lors de la récupération du nom du DP." });
        }

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

// Voir si utilisé
/*app.post("/api/mettre-a-jour-site", async (req, res) => {
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
        res.json({ success: true, data });
    } catch (error) {
        console.error("❌ Erreur mise à jour site:", error);
        res.status(500).json({
            error: "Erreur serveur lors de la mise à jour du site",
        });
    }
});*/

// Vérifié
app.post("/api/update-site", requireAuth, async (req, res) => {
    const { plongeeId, site } = req.body;

    try {
        const { data, error } = await supabase
            .from("plongees")
            .update({ site: site })
            .eq("id", plongeeId)
            .eq("club_id", req.user.club_id);  // Protection par club_id

        if (error) {
            throw error;
        }
        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("❌ Erreur mise à jour site:", err);
        res.status(500).json({ error: err.message });
    }
});

// Vérifié
app.get("/gestion_palanquees", requireAuth, async (req, res) => {
    const plongeeId = req.query.id;

    if (!plongeeId) {
        return res.status(400).send("ID de plongée manquant");
    }

    try {
        // 1. Récupérer la plongée avec vérification du club_id
        const { data: plongee, error: plongeeError } = await supabase
            .from("plongees")
            .select("sortie_id")
            .eq("id", plongeeId)
            .eq("club_id", req.user.club_id)
            .single();

        if (plongeeError || !plongee) {
            return res.status(404).send("Plongée non trouvée.");
        }

        const sortieId = plongee.sortie_id;

        // 2. Récupérer la sortie avec vérification du club_id
        const { data: sortie, error: sortieError } = await supabase
            .from("sorties")
            .select("id, lieu")
            .eq("id", sortieId)
            .eq("club_id", req.user.club_id)
            .single();

        if (sortieError || !sortie) {
            return res.status(404).send("Sortie non trouvée.");
        }

        // 3. Récupérer les plongeurs de la sortie avec vérification du club_id
        const { data: plongeursSortie, error: plongeursError } = await supabase
            .from("plongeurs_sorties")
            .select("plongeur_id")
            .eq("sortie_id", sortieId)
            .eq("club_id", req.user.club_id);

        if (plongeursError) {
            return res.status(500).send("Erreur lors de la récupération des plongeurs.");
        }

        if (!plongeursSortie.length) {
            return res.status(404).send("Aucun plongeur trouvé pour cette sortie.");
        }

        // 4. Récupérer les détails des plongeurs du club
        const plongeurIds = plongeursSortie.map((p) => p.plongeur_id);

        const { data: plongeurs, error: detailsError } = await supabase
            .from("plongeurs")
            .select("id, nom, niveau")
            .in("id", plongeurIds)
            .eq("club_id", req.user.club_id);

        if (detailsError) {
            return res.status(500).send("Erreur lors de la récupération des détails des plongeurs.");
        }

        // 5. Envoyer les données à la vue
        res.render("gestion_palanquees", { plongee: sortie, plongeurs });
    } catch (error) {
        console.error("Erreur serveur:", error);
        res.status(500).send("Erreur interne du serveur.");
    }
});

// Vérifié
app.get("/get_palanquees/:plongee_id", requireAuth, async (req, res) => {
    const { plongee_id } = req.params;

    try {
        // Vérifier que la plongée appartient au club de l'utilisateur
        const { data: plongee, error: plongeeError } = await supabase
            .from("plongees")
            .select("sortie_id")
            .eq("id", plongee_id)
            .eq("club_id", req.user.club_id)
            .single();

        if (plongeeError || !plongee) {
            throw new Error("Plongée non trouvée ou accès non autorisé");
        }

        const sortie_id = plongee.sortie_id;

        // Récupérer les palanquées avec vérification du club_id
        const { data: palanquees, error: palanqueesError } = await supabase
            .from("palanquees")
            .select(`
                id, nom, profondeur, duree, paliers,
                palanquees_plongeurs (
                    plongeur_id,
                    niveau_plongeur_historique,
                    gaz_type,
                    plongeurs (
                        id,
                        nom,
                        niveau
                    )
                )
            `)
            .eq("plongee_id", plongee_id)
            .eq("club_id", req.user.club_id);

        if (palanqueesError) throw new Error(palanqueesError.message);

        // Récupérer les plongeurs de la sortie avec vérification du club_id
        const { data: plongeursSorties, error: plongeursSortiesError } = await supabase
            .from("plongeurs_sorties")
            .select("plongeur_id")
            .eq("sortie_id", sortie_id)
            .eq("club_id", req.user.club_id);

        if (plongeursSortiesError) throw new Error(plongeursSortiesError.message);

        const plongeursIds = plongeursSorties.map(ps => ps.plongeur_id);

        let plongeurs = [];
        if (plongeursIds.length > 0) {
            const { data, error } = await supabase
                .from("plongeurs")
                .select("*")
                .in("id", plongeursIds)
                .eq("club_id", req.user.club_id);

            if (error) throw new Error(error.message);
            plongeurs = data;
        }

        let plongeursPalanquees = [];
        if (palanquees.length > 0) {
            const { data, error } = await supabase
                .from("palanquees_plongeurs")
                .select("plongeur_id")
                .in("palanquee_id", palanquees.map(p => p.id))
                .eq("club_id", req.user.club_id);

            if (error) throw new Error(error.message);
            plongeursPalanquees = data;
        }

        const plongeursInPalanquees = plongeursPalanquees.map(pp => pp.plongeur_id);
        const plongeursDisponibles = plongeurs.filter(plongeur => !plongeursInPalanquees.includes(plongeur.id));

        res.status(200).json({ palanquees, plongeurs: plongeursDisponibles });

    } catch (error) {
        console.error("❌ Erreur lors de la récupération des données :", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Vérifié
app.post("/enregistrer_palanquee", requireAuth, async (req, res) => {
    const palanquees = req.body;

    if (!Array.isArray(palanquees) || palanquees.length === 0) {
        return res.status(400).json({ error: "Données invalides ou incomplètes" });
    }

    const erreurs = [];
    const plongee_id = palanquees[0]?.plongee_id;

    if (!plongee_id) {
        return res.status(400).json({ error: "Plongée ID manquant" });
    }

    try {
        // Vérifier que la plongée appartient au club
        const { data: plongeeCheck, error: plongeeCheckError } = await supabase
            .from("plongees")
            .select("id")
            .eq("id", plongee_id)
            .eq("club_id", req.user.club_id)
            .single();

        if (plongeeCheckError || !plongeeCheck) {
            return res.status(403).json({ error: "Accès non autorisé à cette plongée" });
        }

        // Récupération des palanquées existantes avec vérification du club_id
        const { data: existingPalanquees, error: fetchError } = await supabase
            .from("palanquees")
            .select("id, nom, profondeur, duree, paliers")
            .eq("plongee_id", plongee_id)
            .eq("club_id", req.user.club_id);

        if (fetchError) {
            console.error("Erreur lors de la récupération des palanquées existantes : ", fetchError);
            return res.status(500).json({ error: "Erreur récupération des palanquées existantes" });
        }

        const existingPalanqueesMap = new Map(existingPalanquees.map(p => [p.id, p]));

        // Traitement des palanquées
        const updatedPalanquees = [];
        for (const palanqueeData of palanquees) {
            let { id, nom, profondeur, duree, paliers, plongeurs, gazType } = palanqueeData;

            if (!nom || !plongeurs || plongeurs.length === 0) {
                erreurs.push({ palanquee: nom, message: "Données invalides ou incomplètes" });
                continue;
            }

            // Vérification ou insertion de la palanquée
            if (id) {
                if (existingPalanqueesMap.has(id)) {
                    const { error: updateError } = await supabase
                        .from("palanquees")
                        .update({ nom, profondeur, duree, paliers })
                        .eq("id", id)
                        .eq("club_id", req.user.club_id);

                    if (updateError) {
                        erreurs.push({ palanquee: nom, message: updateError.message });
                        continue;
                    }
                    updatedPalanquees.push({ id, plongeurs, gazType });
                } else {
                    erreurs.push({ palanquee: nom, message: "ID invalide, palanquée inexistante" });
                    continue;
                }
            } else {
                const { data: newPalanquee, error: insertError } = await supabase
                    .from("palanquees")
                    .insert([{
                        plongee_id,
                        nom,
                        profondeur,
                        duree,
                        paliers,
                        club_id: req.user.club_id
                    }])
                    .select()
                    .single();

                if (insertError) {
                    erreurs.push({ palanquee: nom, message: insertError.message });
                } else {
                    updatedPalanquees.push({ id: newPalanquee.id, plongeurs, gazType });
                }
            }
        }

        // Mise à jour des plongeurs avec gazType
        console.log("🔎 Données reçues (updatedPalanquees):", JSON.stringify(updatedPalanquees, null, 2));

        for (const palanquee of updatedPalanquees) {
            const { id, plongeurs, gazType } = palanquee;

            // Supprimer d'abord les plongeurs existants pour cette palanquée
            const { error: deleteError } = await supabase
                .from("palanquees_plongeurs")
                .delete()
                .eq("palanquee_id", id)
                .eq("club_id", req.user.club_id);

            if (deleteError) {
                erreurs.push({ palanquee: palanquee.nom, message: deleteError.message });
                continue;
            }

            if (plongeurs.length > 0) {
                const plongeursData = await Promise.all(plongeurs.map(async (plongeurItem) => {
                    const { plongeur_id, gaz_type = "Air" } = plongeurItem;

                    const { data: plongeur, error: plongeurError } = await supabase
                        .from("plongeurs")
                        .select("nom, niveau")
                        .eq("id", plongeur_id)
                        .eq("club_id", req.user.club_id)
                        .single();

                    if (plongeurError || !plongeur) {
                        erreurs.push({ plongeur: plongeur_id, message: "Plongeur non trouvé ou accès non autorisé" });
                        return null;
                    }

                    return {
                        palanquee_id: id,
                        plongeur_id,
                        nom_plongeur: plongeur.nom,
                        niveau_plongeur: plongeur.niveau,
                        niveau_plongeur_historique: plongeur.niveau,
                        club_id: req.user.club_id,
                        gaz_type: gaz_type
                    };
                }));


                const plongeursDataValid = plongeursData.filter(data => data !== null);
                console.log("👀 Tentative insertion des plongeurs pour palanquée:", id);
                console.log("📦 Données à insérer:", plongeursDataValid);

                if (plongeursDataValid.length > 0) {
                    const { error: plongeursError } = await supabase
                        .from("palanquees_plongeurs")
                        .insert(plongeursDataValid);

                    if (plongeursError) {
                        console.error("❌ Erreur insertion plongeurs:", plongeursError);
                        erreurs.push({ palanquee: palanquee.nom, message: plongeursError.message });
                    } else {
                        console.log("✅ Insertion plongeurs OK pour palanquée:", id);
                    }
                }
            }
        }

        if (erreurs.length > 0) {
            return res.status(207).json({ message: "Certaines palanquées ont rencontré des erreurs", erreurs });
        }

        res.status(201).json({ message: "Toutes les palanquées ont été enregistrées avec succès !" });
    } catch (error) {
        console.error("Erreur inattendue : ", error);
        res.status(500).json({ error: error.message });
    }
});



// Vérifié
app.delete("/supprimer_palanquee/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ error: "ID de palanquée manquant" });
    }

    try {
        // Suppression des relations dans palanquees_plongeurs avec vérification du club_id
        await supabase
            .from("palanquees_plongeurs")
            .delete()
            .eq("palanquee_id", id)
            .eq("club_id", req.user.club_id);

        // Suppression de la palanquée avec vérification du club_id
        const { error } = await supabase
            .from("palanquees")
            .delete()
            .eq("id", id)
            .eq("club_id", req.user.club_id);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ message: "Palanquée supprimée avec succès" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Récupérer les palanquées avec leurs plongeurs
// Voir si utilisé
/*app.get("/palanquees", async (req, res) => {
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
});*/

// Récupérer les paramètres des palanquées
// Vérifié
app.get("/parametres_palanquees", requireAuth, async (req, res) => {
    const plongeeId = req.query.id;

    if (!plongeeId) {
        console.error("❌ Erreur: Aucun ID de plongée fourni dans l'URL.");
        return res.status(400).send("ID de plongée manquant.");
    }

    try {
        // Vérifier que la plongée appartient au club
        const { data: plongee, error: plongeeError } = await supabase
            .from("plongees")
            .select("id")
            .eq("id", plongeeId)
            .eq("club_id", req.user.club_id)
            .single();

        if (plongeeError || !plongee) {
            return res.status(404).send("Plongée non trouvée.");
        }

        // Récupérer les palanquées avec vérification du club_id
        let { data: palanquees, error: errorPalanquees } = await supabase
            .from("palanquees")
            .select("*")
            .eq("plongee_id", plongeeId)
            .eq("club_id", req.user.club_id);

        if (errorPalanquees) throw errorPalanquees;

        if (!palanquees || palanquees.length === 0) {
            return res.render("parametres_palanquees", { palanquees: [] });
        }

        for (let palanquee of palanquees) {
            if (!palanquee.id || typeof palanquee.id !== "string") {
                console.error(`❌ Erreur: palanquee.id est invalide (${palanquee.id})`);
                continue;
            }

            // Récupérer les plongeurs de la palanquée avec vérification du club_id
            let { data: palanqueesPlongeurs, error: errorLien } = await supabase
                .from("palanquees_plongeurs")
                .select("plongeur_id, niveau_plongeur_historique")
                .eq("palanquee_id", palanquee.id)
                .eq("club_id", req.user.club_id);

            if (errorLien) {
                console.error(`❌ Erreur récupération plongeurs pour ${palanquee.id}:`, errorLien);
                continue;
            }

            const plongeurIds = palanqueesPlongeurs.map(p => p.plongeur_id);

            if (plongeurIds.length === 0) {
                palanquee.plongeurs = [];
                continue;
            }

            // Récupérer les détails des plongeurs avec vérification du club_id
            let { data: plongeurs, error: errorPlongeurs } = await supabase
                .from("plongeurs")
                .select("*")
                .in("id", plongeurIds)
                .eq("club_id", req.user.club_id);

            if (errorPlongeurs) {
                console.error(`❌ Erreur récupération détails plongeurs pour ${palanquee.id}:`, errorPlongeurs);
                continue;
            }

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

// Vérifié
app.post("/sauvegarder_parametres", requireAuth, async (req, res) => {
    const { id, profondeur, duree, paliers, type } = req.body;

    if (!id || profondeur === undefined || duree === undefined || paliers === undefined || !type) {
        return res.status(400).json({ error: "Données invalides ou incomplètes." });
    }

    try {
        let { error } = await supabase
            .from("palanquees")
            .update({
                profondeur,
                duree,
                paliers,
                type
            })
            .eq("id", id)
            .eq("club_id", req.user.club_id);  // Protection par club_id

        if (error) {
            console.error(`❌ Erreur mise à jour palanquée ${id}:`, error);
            return res.status(500).json({ error: "Erreur serveur lors de la mise à jour." });
        }

        res.json({ success: true, message: "Paramètres enregistrés avec succès !" });
    } catch (error) {
        console.error("❌ Erreur serveur :", error);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// Vérifié
app.get("/plongee_info", requireAuth, async (req, res) => {
    const plongeeId = req.query.id;

    if (!plongeeId) {
        return res.status(400).json({ error: "ID de plongée manquant." });
    }

    try {
        // Récupérer les données de la plongée avec vérification du club_id
        let { data, error } = await supabase
            .from("plongees")
            .select("date, site, nomdp, heure_debut, image_url, club_id")
            .eq("id", plongeeId)
            .eq("club_id", req.user.club_id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: "Plongée non trouvée." });
        }

        const dateFormattee = new Date(data.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
        const nomSitePlongee = data.site || "Site inconnu";

        let nomDuDP = "DP non trouvé";
        let niveauDP = "Niveau non trouvé";

        if (data.nomdp) {
            let { data: dpData, error: dpError } = await supabase
                .from("plongeurs")
                .select("nom, niveau")
                .eq("id", data.nomdp)
                .eq("club_id", req.user.club_id)
                .single();

            if (dpError) {
                console.error("Erreur lors de la récupération du DP:", dpError);
            } else if (dpData) {
                nomDuDP = dpData.nom || "Nom du DP non trouvé";
                niveauDP = dpData.niveau || "Niveau du DP non trouvé";
            }
        }

        res.json({
            date: dateFormattee,
            site: nomSitePlongee,
            nomdp: nomDuDP,
            niveaudp: niveauDP,
            heure_debut: data.heure_debut,
            image_url: data.image_url
        });
    } catch (err) {
        console.error("Erreur récupération plongée:", err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});



//Voir si utilisé
/*app.get("/modif_palanquee/:id", async (req, res) => {
    const palanqueeId = req.params.id;

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
});*/

// Voir si utilisé
/*app.post('/supprimer_palanquee', async (req, res) => {
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
});*/

// Voir si utilisé
/*app.post("/ajouter-plongee", async (req, res) => {
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
});*/

// Vérifié
app.post('/retirer-plongeur', requireAuth, async (req, res) => {
    const { plongeurId, sortieId } = req.body;

    if (!plongeurId || !sortieId) {
        return res.status(400).json({ success: false, message: "Plongeur ou sortie manquant." });
    }

    try {
        // Suppression avec vérification du club_id
        const { error } = await supabase
            .from('plongeurs_sorties')
            .delete()
            .eq('plongeur_id', plongeurId)
            .eq('sortie_id', sortieId)
            .eq('club_id', req.user.club_id);  // Protection par club_id

        if (error) {
            console.error("Erreur lors de la suppression de l'association :", error);
            return res.status(500).json({ success: false, message: "Erreur serveur" });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error("Erreur lors de la suppression :", error);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
});

// Voir si utilisé
/*app.post("/api/set-dp", async (req, res) => {
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
});*/

// Route pour gérer le webhook
// Voir si utilisé
/*app.post('/webhook', (req, res) => {

    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).send("Erreur: Le corps de la requête est invalide.");
    }

    if (req.body.ref === 'refs/heads/main') {

        const exec = require('child_process').exec;
        exec('/home/ludo/app/palanquee-app/deploy.sh', (error, stdout, stderr) => {
            if (error) {
                console.error(`Erreur d'exécution: ${stderr}`);
                return res.status(500).send("Erreur lors du déploiement.");
            }
            res.send("Déploiement réussi !");
        });
    } else {
        res.status(200).send("Aucun déploiement nécessaire.");
    }
});*/

// Vérifié
app.delete("/delete-plongee/:id", requireAuth, async (req, res) => {
    const plongeeId = req.params.id;

    if (!plongeeId) {
        return res.status(400).json({ error: "ID de plongée manquant" });
    }

    try {
        const { error } = await supabase
            .from("plongees")
            .delete()
            .eq("id", plongeeId)
            .eq("club_id", req.user.club_id);  // Protection par club_id

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ success: true, message: "Plongée supprimée avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vérifié
app.post('/enregistrer-consignes', requireAuth, async (req, res) => {
    const { palanquee_id, prof_max, duree_max } = req.body;

    if (!palanquee_id || !prof_max || !duree_max) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Mise à jour avec vérification du club_id
    const { error } = await supabase
        .from('palanquees')
        .update({ prof_max, duree_max })
        .eq('id', palanquee_id)
        .eq('club_id', req.user.club_id);  // Protection par club_id

    if (error) {
        console.error("Erreur Supabase :", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }

    res.json({ success: true, message: "Consignes enregistrées avec succès !" });
});

// 🚀 Route API pour envoyer un email avec le PDF
// Vérifié
app.post("/send-email", requireAuth, async (req, res) => {
    const { email, pdfUrl } = req.body;

    if (!email || !pdfUrl) {
        return res.status(400).json({ error: "Email et PDF requis" });
    }

    // Important: Sécurité des informations sensibles
    // En production, utilisez plutôt des variables d'environnement
    let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER || "ludosams@gmail.com",
            pass: process.env.EMAIL_PASS || "vjqy kriu sgcu qtlz"
        }
    });

    let mailOptions = {
        from: `"${req.user.club_name || 'Club de Plongée'}" <${process.env.EMAIL_FROM || 'tonemail@gmail.com'}>`,
        to: email,
        subject: "📄 Compte-rendu de plongée",
        text: `Bonjour,\n\nVoici le compte-rendu de votre plongée.\n\nCordialement,\n${req.user.club_name || 'L\'équipe de plongée'}.`,
        attachments: [
            {
                filename: "Compte-rendu-Plongée.pdf",
                path: pdfUrl
            }
        ]
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Email envoyé avec succès !" });
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'email :", error);
        res.status(500).json({ error: "Erreur lors de l'envoi de l'email" });
    }
});

// Voir si utilisé
/*app.post("/api/lancer-plongee", async (req, res) => {
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
});*/

// Vérifié
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        // Récupération des statistiques filtrées par club_id
        const { count: plongeursCount } = await supabase
            .from('plongeurs')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', req.user.club_id);

        const { count: sortiesCount } = await supabase
            .from('sorties')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', req.user.club_id);

        const { count: palanqueesCount } = await supabase
            .from('palanquees')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', req.user.club_id);

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

// Vérifié
app.post('/api/palanquees/mise-a-leau', requireAuth, async (req, res) => {
    try {
        const { palanquee_id, heure_mise_a_leau } = req.body;

        // Vérification existante avec club_id
        const { data: existing, error: fetchError } = await supabase
            .from('palanquees')
            .select('heure_mise_a_leau')
            .eq('id', palanquee_id)
            .eq('club_id', req.user.club_id)
            .single();

        if (fetchError) throw fetchError;
        if (existing?.heure_mise_a_leau) {
            return res.status(400).json({ error: 'Heure déjà enregistrée' });
        }

        // Mise à jour avec vérification du club_id
        const { data, error } = await supabase
            .from('palanquees')
            .update({ heure_mise_a_leau })
            .eq('id', palanquee_id)
            .eq('club_id', req.user.club_id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur Supabase:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route POST pour gérer l'upload d'une image
// Vérifié
app.post('/upload-image', requireAuth, async (req, res) => {
    try {
        const { imageData, plongeeId } = req.body;

        // Vérifier que la plongée appartient au club avant tout traitement
        const { data: plongee, error: checkError } = await supabase
            .from('plongees')
            .select('id')
            .eq('id', plongeeId)
            .eq('club_id', req.user.club_id)
            .single();

        if (checkError || !plongee) {
            return res.status(403).json({ error: 'Plongée non trouvée ou accès non autorisé' });
        }

        // Convertir et uploader l'image
        const buffer = Buffer.from(imageData.split(',')[1], 'base64');
        const file = new Blob([buffer], { type: 'image/png' });
        const filePath = `plongees-images/${req.user.club_id}/${Date.now()}_carte_plongee.png`;

        const { data, error } = await supabase.storage
            .from('plongees-images')
            .upload(filePath, file);

        if (error) {
            return res.status(500).json({ error: 'Erreur lors de l\'upload de l\'image' });
        }

        // Mise à jour avec vérification du club_id
        const { error: updateError } = await supabase
            .from('plongees')
            .update({ image_url: `${supabase.storageUrl}/plongees-images/${data.path}` })
            .eq('id', plongeeId)
            .eq('club_id', req.user.club_id);

        if (updateError) {
            return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de l\'URL' });
        }

        return res.json({
            success: true,
            imageUrl: `${supabase.storageUrl}/plongees-images/${data.path}`
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Une erreur est survenue lors de l\'upload de l\'image' });
    }
});

app.get('/inscription', (req, res) => {
    res.render('inscription', { error: null }); // Assure que error est toujours défini
});

// Route pour traiter l'inscription
app.post('/inscription', async (req, res) => {
    console.log('Corps de la requête reçu:', req.body);
    const {
        club_name,
        affiliation_number,
        postal_code,
        city,
        address,
        first_name,
        last_name,
        email,
        password
    } = req.body;

    console.log('Début inscription - Données reçues:', req.body);

    try {
        // 1. Validation
        if (!club_name || !affiliation_number || !email || !password) {
            console.log('Validation failed - missing fields');
            return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis' });
        }

        // 2. Création du club
        console.log('Tentative création club...');
        const { data: newClub, error: clubError } = await supabase
            .from('clubs')
            .insert([{
                name: club_name,
                affiliation_number: parseInt(affiliation_number),
                postal_code: postal_code, // Pas de parseInt si text dans votre table
                city,
                address,
                created_at: new Date()
            }])
            .select()
            .single();

        if (clubError) {
            console.error('ERREUR CLUB:', clubError);
            return res.status(500).json({ error: 'Erreur création club: ' + clubError.message });
        }
        console.log('Club créé:', newClub.id);

        // 3. Création Auth
        console.log('Tentative création auth user...');
        const { data: authUser, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name,
                    last_name,
                    club_id: newClub.id,
                    role: 'admin'
                }
            }
        });

        if (authError || !authUser.user) {
            console.error('ERREUR AUTH:', authError);
            await supabase.from('clubs').delete().eq('id', newClub.id);
            return res.status(500).json({ error: 'Erreur auth: ' + (authError?.message || 'No user returned') });
        }
        console.log('Auth user créé:', authUser.user.id);

        // 4. Création public.Users
        console.log('Tentative création public.users...');
        const { data: publicUser, error: userError } = await supabase
            .from('users') // Exactement comme dans votre table (sensibilité à la casse)
            .insert([{
                id: authUser.user.id,
                email,
                first_name,
                last_name,
                club_id: newClub.id,
                role: 'admin',
                created_at: new Date()
            }])
            .select()
            .single();

        if (userError) {
            console.error('ERREUR PUBLIC.USERS:', userError);
            console.log('Rollback: suppression auth user et club...');
            await supabase.auth.admin.deleteUser(authUser.user.id);
            await supabase.from('clubs').delete().eq('id', newClub.id);
            return res.status(500).json({
                error: 'Erreur création utilisateur: ' + userError.message,
                details: userError
            });
        }

        console.log('Inscription complète réussie !');
        res.status(201).json({
            success: true,
            message: 'Inscription réussie'
        });

    } catch (error) {
        console.error('ERREUR GLOBALE:', error);
        res.status(500).json({
            success: false,
            error: 'Message d\'erreur clair'
        });
    }
});

// Route pour afficher la page d'administration
app.get('/administration', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Récupère les membres du club
        const { data: members, error } = await supabase
            .from('users')
            .select('id, first_name, last_name, email, role, created_at')
            .eq('club_id', req.user.club_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('administration', {
            members,
            currentUser: req.user
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).render('error', { message: 'Erreur serveur' });
    }
});

// API - Ajouter un membre
app.post('/api/members', requireAuth, async (req, res) => {
    try {
        const { first_name, last_name, email, role } = req.body;

        // Mot de passe par défaut
        const DEFAULT_PASSWORD = "clubplongee123";

        // 1. Créer l'utilisateur dans l'authentification
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: DEFAULT_PASSWORD,
            email_confirm: true, // Auto-confirmer l'email
            user_metadata: {
                first_name,
                last_name
            }
        });

        if (authError) throw authError;

        // 2. Ajouter dans la table users
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .insert({
                id: authUser.user.id,
                first_name,
                last_name,
                email,
                role: role || 'member',
                club_id: req.user.club_id,
            })
            .select();

        if (dbError) throw dbError;

        res.json(dbUser);

    } catch (error) {
        console.error('Erreur création membre:', error);
        res.status(500).json({
            error: "Erreur lors de la création du membre",
            details: error.message
        });
    }
});

// API - Lister les membres
app.get('/api/members', requireAuth, async (req, res) => {
    try {
        console.log("Tentative de récupération des membres pour club_id:", req.user.club_id);

        if (!req.user?.club_id) {
            console.error("Erreur: club_id manquant dans l'utilisateur");
            return res.status(400).json({ error: "club_id manquant" });
        }

        const { data, error } = await supabase
            .from('users')
            .select('id, first_name, last_name, email, role, created_at')
            .eq('club_id', req.user.club_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Erreur Supabase:", error);
            throw error;
        }

        console.log("Membres récupérés:", data.length);
        res.json(data);

    } catch (error) {
        console.error("Erreur complète:", error);
        res.status(500).json({
            error: "Erreur serveur",
            details: error.message
        });
    }
});

// Route pour supprimer un membre (avec requireAuth)
// Route DELETE avec paramètre ID
app.delete('/api/members/:id', requireAuth, async (req, res) => {
    const memberId = req.params.id;

    try {
        // Étape 1: Supprimer de la table publique (ce que vous faites déjà)
        const { error: publicError } = await supabase
            .from('users')
            .delete()
            .eq('id', memberId);

        if (publicError) throw publicError;

        // Étape 2: Supprimer de auth.users via l'API Auth
        const { error: authError } = await supabase.auth.admin.deleteUser(
            memberId
        );

        if (authError) throw authError;

        res.json({ success: true, message: "Utilisateur supprimé complètement" });
    } catch (error) {
        console.error('Erreur suppression:', error);
        res.status(500).json({
            error: error.message || 'Erreur lors de la suppression complète'
        });
    }
});

// API - Modifier un membre
app.delete('/api/members/:id', requireAuth, async (req, res) => {
    try {
        // 1. Vérification que le membre existe
        const { data: member, error: fetchError } = await supabase
            .from('users')
            .select('id, club_id, role')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !member) {
            return res.status(404).json({ error: 'Membre non trouvé' });
        }

        // 2. Vérification des permissions
        if (member.club_id !== req.user.club_id) {
            return res.status(403).json({ error: 'Action non autorisée' });
        }

        // 3. Désactivation du membre
        const { error: updateError } = await supabase
            .from('users')
            .update({ is_active: false })
            .eq('id', req.params.id);

        if (updateError) throw updateError;

        // 4. Réponse JSON valide même quand vide
        res.set('Content-Type', 'application/json');
        res.status(204).send();

    } catch (error) {
        console.error('Erreur:', {
            userId: req.user.id,
            memberId: req.params.id,
            error: error.message
        });

        // 5. Garantir une réponse JSON en cas d'erreur
        res.status(500).json({
            error: 'Erreur lors de la suppression',
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

// Route pour changer le mot de passe
app.post('/api/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id; // ID de l'utilisateur connecté

        // 1. Authentifier d'abord avec le mot de passe actuel
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: req.user.email, // Vous devez avoir l'email dans req.user
            password: currentPassword
        });

        if (authError) {
            return res.status(401).json({
                error: 'Mot de passe actuel incorrect',
                details: authError.message
            });
        }

        // 2. Validation du nouveau mot de passe
        if (newPassword.length < 8) {
            return res.status(400).json({
                error: 'Le mot de passe doit contenir au moins 8 caractères'
            });
        }

        // 3. Mise à jour du mot de passe via l'API d'authentification
        const { data: updateData, error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) {
            throw updateError;
        }

        // 5. Réponse de succès
        res.json({
            success: true,
            message: 'Mot de passe mis à jour avec succès'
        });

    } catch (error) {
        console.error('Erreur changement mot de passe:', {
            userId: req.user?.id,
            error: error.message
        });

        res.status(500).json({
            error: 'Erreur lors du changement de mot de passe',
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

app.get('/check-sortie-en-cours', requireAuth, async (req, res) => {
    try {
        // Vérifiez que l'utilisateur est bien connecté et a un club_id
        if (!req.user?.club_id) {
            return res.status(401).json({ error: "Non autorisé" });
        }

        const clubId = req.user.club_id;

        // Sortie en cours
        const { data: currentSorties, error: currentError } = await supabase
            .from('sorties')
            .select('id, lieu, date_debut, date_fin')
            .eq('club_id', clubId)
            .lte('date_debut', new Date().toISOString().split('T')[0])
            .gte('date_fin', new Date().toISOString().split('T')[0]);

        if (currentError) throw currentError;

        const sortieEnCours = currentSorties?.length > 0;
        const sortie = sortieEnCours ? currentSorties[0] : null;

        // Prochaine sortie
        const { data: nextSorties, error: nextError } = await supabase
            .from('sorties')
            .select('id, lieu, date_debut, date_fin')
            .eq('club_id', clubId)
            .gt('date_debut', new Date().toISOString().split('T')[0])
            .order('date_debut', { ascending: true })
            .limit(1);

        if (nextError) throw nextError;

        const prochaineSortie = nextSorties?.length > 0 ? nextSorties[0] : null;

        res.json({
            sortieEnCours,
            sortie,
            prochaineSortie
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/historique-pdfs', (req, res) => {
    // Lire les fichiers dans le dossier public/pdf
    fs.readdir(pdfDirectory, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Erreur lors de la lecture des fichiers." });
        }
        // Filtrer les fichiers pour ne garder que les PDF
        const pdfFiles = files.filter(file => file.endsWith('.pdf'));

        // Retourner la liste des fichiers PDF
        res.json({ pdfFiles });
    });
});

// Route pour supprimer un PDF
app.delete('/delete-pdf/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(pdfDirectory, filename);

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({ error: "Erreur lors de la suppression du fichier." });
        }
        res.json({ success: `Fichier ${filename} supprimé avec succès.` });
    });
});

// Route pour afficher l'historique des PDFs
app.get('/histopdf', (req, res) => {
    res.render('histopdf');  // Assure-toi que le fichier histopdf.ejs existe dans ton dossier views
});

// Démarrer le serveur HTTPS
const server = https.createServer(options, app);

server.listen(port, host, () => {
    console.log(`Server is running on https://${host}:${port}`);
});

