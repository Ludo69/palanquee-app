console.log("admin.js chargé");

document.addEventListener("DOMContentLoaded", async () => {
    // Vérification si utilisateur admin (déjà géré côté serveur, mais double sécurité)
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        window.location.href = '/';
        return;
    }

    document.getElementById("add-member-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        
        const email = document.getElementById("member-email").value;
        const role = document.getElementById("member-role").value;

        if (!email) {
            alert("Veuillez entrer un email valide.");
            return;
        }

        // Création du compte utilisateur via Supabase
        const { data: newUser, error: signUpError } = await supabase.auth.signUp({
            email,
            password: "MotDePasseTemporaire123!"
        });

        if (signUpError) {
            console.error("Erreur création utilisateur :", signUpError);
            alert("Erreur lors de la création de l'utilisateur.");
            return;
        }

        console.log("Utilisateur créé :", newUser);

        // Ajout dans la table `users`
        const { error: insertError } = await supabase
            .from("users")
            .insert([{ id: newUser.user.id, email, role }]);

        if (insertError) {
            console.error("Erreur ajout dans users :", insertError);
            alert("Erreur lors de l'ajout du membre.");
            return;
        }

        alert("Membre ajouté avec succès !");
        window.location.reload(); // Recharger la page pour voir la liste mise à jour
    });
});
