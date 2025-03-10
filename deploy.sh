#!/bin/bash

# Envoyer une réponse HTTP valide avant d'exécuter le script
echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nDéploiement en cours..."

# Se positionner dans le dossier de l'application
cd /home/ludo/app/palanquee-app || exit

# Récupérer les dernières modifications du dépôt Git
echo "Mise à jour du code depuis Git..."
git pull origin main

# Installer les dépendances
echo "Installation des dépendances..."
npm install

# Redémarrer l'application avec PM2
echo "Redémarrage de l'application..."
pm2 restart palanquee-app || pm2 start npm --name "palanquee-app" -- run start

# Confirmer le succès
echo "Déploiement terminé avec succès !"

