# Seal Odyssey — copie locale complète

Cette archive contient tous les fichiers suivis du dépôt (code, images, sons, tests, documentation), le jeu compilé dans `dist`, ainsi que l'historique Git dans `seal-odyssey-history.bundle`. Le fichier SOURCE-COMMIT.txt identifie exactement la version exportée.

## Jouer sans Internet

Installez Node.js 24 une fois, puis décompressez l'archive dans un dossier local. Sous Windows, ouvrez LANCER-SEAL-ODYSSEY.cmd. Sous macOS ou Linux, lancez `node scripts/serve-offline.mjs` depuis ce dossier, puis ouvrez http://127.0.0.1:4173. Après installation de Node.js, ce jeu compilé fonctionne sans connexion ni téléchargement de dépendances.

Évitez un dossier OneDrive si vous souhaitez une copie indépendante de la synchronisation cloud. Fermez la fenêtre du serveur pour arrêter le jeu. Les sauvegardes restent dans le navigateur, sur cette adresse locale ; la sauvegarde de GitHub Pages ne se transfère pas automatiquement.

## Modifier le code

Avec Internet lors de la première installation : `npm install --global pnpm@11.19.0`, puis `pnpm install --frozen-lockfile`. Ensuite `pnpm dev`, `pnpm test` ou `pnpm build`. La version compilée incluse reste utilisable sans cette installation.

Pour retrouver l'historique : `git clone seal-odyssey-history.bundle seal-odyssey-historique`. La copie locale et GitHub peuvent ensuite être synchronisés par Git, mais cette archive n'envoie aucune modification automatiquement.

## Documents et accès

Cette exportation contient les fichiers du dépôt GitHub. Les PDF, images ou conversations qui existent uniquement dans ChatGPT, Canva ou sur un autre ordinateur ne sont pas automatiquement présents dans ce dépôt : conservez-les aussi dans un sous-dossier `references`. Aucun mot de passe ni jeton GitHub n'est nécessaire pour jouer.

La vue d'exploration est une bêta en cours de validation. Le dossier ne constitue pas une version finale publiée ni une application Play Store.

## Projet ChatGPT « Seal Odyssey »

Un projet ChatGPT conserve des conversations et références dans le cloud ; ce n'est pas le dossier de développement local. Pour réunir la conversation dans un projet existant, utilisez le menu de la conversation, puis « Déplacer vers le projet » et choisissez Seal Odyssey. Le téléchargement et la décompression de cette archive réalisent la copie locale du jeu. Aucun déplacement de conversation ni écriture sur votre ordinateur n'est effectué par le dépôt GitHub.
