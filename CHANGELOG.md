# Changelog

Les changements notables de cette reprise locale sont consignés ici. Le format suit l'esprit de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions applicatives suivent le versionnage sémantique quand il devient pertinent.

## [0.3.0] - 2026-10-06

### Ajouté

- Corps continu de Luma, rig de tête et d’arrière-train, posture de plage et transition amortie vers la nage.
- Cartes de pelage gris tacheté, ventre et museau crème, microrelief de poil et réponse au mouillage.
- Yeux sombres réfléchissants, clignement cohérent, moustaches courbes et nageoires profilées.
- Falaises stratifiées, arches maçonnées, tours ruinées, mousses et cascades en 3D.
- Tests du modèle et des collisions côtières ; captures JPEG réelles avec métadonnées de build sur une branche de revue.

### Amélioré

- Rivage sableux, lumière chaude, environnement de réflexion et caméra rapprochée.
- Animation de Luma pendant l’introduction et le soin.
- Libération unique des cartes et squelettes du personnage lors de la fermeture.

### Limites documentées

- La fiche Luma visible le 6 octobre guide la construction ; la qualité de son illustration n’est pas encore atteinte.
- Modèles, animation et son restent procéduraux ; validation logicielle à distinguer des mesures sur iPhone.

## [0.2.0] - 2026-10-05

### Ajouté

- Ambiance Web Audio facultative : mer/brise, immersion, signaux d’Échos, restauration et soin ; activation par geste, contrôle du son et suspension lorsque l’onglet est masqué.
- Vérification automatisée du navigateur : vrais shaders WebGL, démarrage, son et soin sur profils bureau et paysage tactile, avec captures et diagnostics.

### Amélioré

- Eau : normales des vagues, coloration selon la profondeur, reflets approximés du ciel et écume suivant le relief partagé avec le déplacement.
- Alignement du soleil et de la lumière ; conversion colorimétrique des shaders d’eau et de ciel.
- Pelage de Luma : mouillage rapide et séchage progressif.
- Introduction centrée sur la traversée d’Aqualys et statut de publication actualisé.
- Activation native des boutons au clavier, libération des touches après changement de focus et nettoyage complet de la session pendant le développement.

### Limites documentées

- Cette étape conserve les modèles procéduraux ; elle ne revendique pas la qualité des assets finaux.
- Les PDF joints en octobre n’ont pas pu être ouverts dans cette session ; le canon publié sert de référence.
- La validation WebGL logicielle ne remplace pas les essais sur iPhone réel.

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
