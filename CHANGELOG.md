# Changelog

Les changements notables de cette reprise locale sont consignés ici. Le format suit l'esprit de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions applicatives suivent le versionnage sémantique quand il devient pertinent.

## [0.1.0] - 2026-10-02

### Ajouté

- Fondation Vite/Three.js modulaire avec versions épinglées (`vite@8.3.2`, `three@0.186.1`).
- Point d'entrée PWA en plein écran paysage avec safe areas iPhone, manifeste et icônes locales.
- Service worker à cache versionné, fonctionnement hors ligne de l'app shell et invitation de mise à jour avant activation.
- HUD mobile accessible : oxygène, énergie, mode, objectif, trois Échos et badge de build/debug.
- Commandes sémantiques pour joystick, caméra, action, plongée, sprint et soin, avec API et événements découplés du rendu.
- Écran d'introduction indiquant explicitement que la bêta source manque et que le monde/Luma sont des proxies procéduraux.
- Modules de domaine pour l'état de partie, la sauvegarde versionnée, les entrées, le gardien, le phoque et les soins.
- Configuration de gameplay centralisée et proxy procédural de Luma.
- Documentation de statut, inventaire des assets, instantané du canon et décision de reprise P0 locale.
- Commande de test basée sur le runner natif de Node.

### Limites documentées

- La bêta avancée, son archive et son historique Git ne sont pas disponibles dans la transmission locale.
- Aucun déploiement distant n'est effectué et aucune parité avec l'ancienne bêta n'est revendiquée.
- Les modèles, textures, animations et sons de production restent à fournir ou à valider.
