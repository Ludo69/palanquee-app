console.log("auth.js chargé"); // Vérification

async function initSupabase() {
    try {
        const response = await fetch('/supabase-config');
        if (!response.ok) throw new Error('Erreur réseau lors de la récupération de la config');

        const config = await response.json();
        //console.log('Configuration Supabase récupérée :', config);  // Affiche la configuration

        if (!config.supabaseUrl || !config.supabaseKey) {
            throw new Error('Configuration Supabase incomplète');
        }

        // Importer Supabase et initialiser le client
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        window.supabase = createClient(config.supabaseUrl, config.supabaseKey);

        //("Supabase initialisé :", window.supabase);

        // Retirer la classe 'hidden' du body pour rendre la page visible
        document.body.classList.remove("hidden");

        // Attendre un peu avant de vérifier le rôle
        await new Promise(resolve => setTimeout(resolve, 1000)); // Attente de 1 seconde

        // Lancer la vérification après l'initialisation
        await checkUserRole(); // Utilisation de await pour s'assurer que Supabase est prêt
    } catch (error) {
        console.error("Erreur d'initialisation de Supabase :", error);
    }
}

async function updateUIBasedOnRole(role) {
    document.querySelectorAll('[data-role-access]').forEach(element => {
        const requiredRoles = element.dataset.roleAccess.split(' ');
        const hasAccess = requiredRoles.includes(role);
        
        // Retire toujours l'état de chargement en premier
        element.removeAttribute('data-role-loading');
        
        // Détermine l'action (hide par défaut si la classe hidden est présente, sinon disable)
        const action = element.dataset.roleAction || 
                      (element.classList.contains('hidden') ? 'hide' : 'disable');
        
        if (hasAccess) {
            // Cas 1: L'utilisateur a les droits
            element.classList.remove('hidden', 'opacity-50', 'cursor-not-allowed');
            element.disabled = false;
            
            // Réactive le gradient vert si nécessaire
            if (element.classList.contains('from-green-400')) {
                element.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        } else {
            // Cas 2: L'utilisateur n'a pas les droits
            if (action === 'hide') {
                element.classList.add('hidden');
            } else {
                element.classList.remove('hidden');
                element.classList.add('opacity-50', 'cursor-not-allowed');
                element.disabled = true;
            }
        }
    });
}

async function checkUserRole() {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            //console.log("Utilisateur non authentifié.");
            window.location.href = "/"; // Redirection si non authentifié
            return;
        }

        //console.log("Utilisateur authentifié:", user);

        const { data, error } = await supabase
            .from("users")
            .select("role")
            .eq("id", user.id)
            .single();

        if (error) {
            console.error("Erreur récupération du rôle :", error);
            return;
        }

        console.log("Rôle de l'utilisateur récupéré : ", data.role);  // Affiche le rôle pour débogage

        // Stocker le rôle de l'utilisateur pour une utilisation ultérieure
        localStorage.setItem('userRole', data.role);

        updateUIBasedOnRole(data.role);

        const adminBtn = document.getElementById("admin-btn");
        const changePasswordBtn = document.getElementById("changePasswordButton");

        if (data.role === "admin" && adminBtn) {
            adminBtn.classList.remove("hidden");
            changePasswordBtn.remove("hidden");
           // console.log("Admin button visible");  // Debug

            adminBtn.addEventListener('click', async () => {
                const { data: session, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) {
                    console.error("Erreur lors de la récupération de la session:", sessionError);
                    return;
                }

                if (session) {
                    const token = session.session.access_token;
                    if (token) {
                        //console.log("Token JWT envoyé:", token); // Log pour vérifier le token
                        window.location.href = `/admin?token=${token}`;
                    } else {
                        //console.error("Token JWT manquant ou invalide.");
                    }
                }
            });
        }
    } catch (error) {
        console.error("Erreur dans checkUserRole :", error);
    }
}

document.addEventListener("DOMContentLoaded", initSupabase); // Appel de l'initSupabase dans l'event listener