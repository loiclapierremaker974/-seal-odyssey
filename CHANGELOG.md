# Changelog

Les changements notables de cette reprise locale sont consignés ici. Le format suit l'esprit de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions applicatives suivent le versionnage sémantique quand il devient pertinent.

## [0.6.0] - 2026-10-07

### Amélioré

- Anatomie procédurale de Luma : corps bas et allongé, tête ronde, yeux bruns et museau rapprochés de la fiche ; articulations stables en nage et nageoires fermées sans pointes croisées.
- Caméras d'exploration et de soin adaptées à la nouvelle hauteur du phoque.
- Bosquets côtiers, fougères à folioles, fleurs, mousses, rubans de kelp et jardins de coraux, avec mouvement sous le vent et les courants.
- Bancs de poissons qui s'écartent de Luma, insectes ailés et petites fourmis à six pattes animées qui dévient puis reprennent leur trajet.
- Feuilles et fleurs flottantes qui suivent la surface réelle, s'inclinent au contact et déclenchent une ride d'eau.
- Décors de combat plus végétaux et effets d'onde, de protection et d'impact réutilisés avec anticipation des gestes.

Les feuilles flottantes sont décoratives et réactives ; elles ne constituent pas des plateformes de saut. La petite faune et les coraux sont des silhouettes génériques de prototype. Les modèles restent procéduraux, et le niveau artistique de la fiche est encore à atteindre.

## [0.5.0] - 2026-10-07

### Ajouté

- Rencontres de courants instables pendant l’exploration, avec arènes au cadrage latéral fixe sur le rivage, dans la lagune et parmi les ruines.
- Six gestes tactiques : onde rapide, onde puissante, protection, esquive, observation et réconfort ; énergie de rencontre, délais de récupération, intentions adverses et enchaînements.
- Animation du phoque et effets de courant propres aux gestes ; interface tactile et clavier avec barres de sérénité et d’agitation.
- Caméra d’exploration protégée des rochers et des falaises, avec correction du bras de suivi après interpolation.
- Retour à la position d’exploration après apaisement, retraite ou pause nécessaire ; souvenir des courants apaisés dans la sauvegarde de Luma, sans modifier sa santé ni son oxygène.

Les adversaires sont des manifestations de courant proposées pour ce prototype ; leur forme ne fixe aucune nouvelle espèce du canon. Le cadrage est en 2D avec des personnages et décors procéduraux rendus par Three.js.

## [0.4.0] - 2026-10-07

### Ajouté

- Petits bonds sur le ventre : anticipation, trajectoire physique, réception amortie et contacts avec le sable ou l’eau. Une touche tenue déclenche un seul bond.
- Articulation du milieu du corps, ondulations de nage et poussées des nageoires liées à la distance parcourue à terre.
- Particules de sable, éclaboussures et rides de surface dans des pools limités selon le profil graphique.
- Bouton tactile contextuel Bondir / Plonger / Remonter et sons discrets des contacts, avec les mêmes préférences audio.
- Tests des trajectoires, transitions rive/eau, pauses, téléportations, ombre et effets ; vérification du bond au clavier et par toucher dans Chromium.

### Amélioré

- Allure terrestre plus lente, rythme du ventre et réception avec compression douce.
- Ombre conservée sur le sol durant le vol ; les soins attendent la fin du bond.
- Eau turquoise, lumière réfléchie alignée avec le soleil et écume plus fine.
- Surface déformée par les impacts de Luma : creux, ondes qui se propagent, sillages et retour au calme ; flottaison sur la même hauteur locale, ventre partiellement immergé.
- Maintenir la remontée à la surface ne fait plus monter Luma dans l’air.

Le jeu reste une fondation procédurale jouable ; le rendu de la fiche demeure la cible artistique.

## [0.3.1] - 2026-10-06

### Amélioré

- Pelage court en volume, solidaire du squelette ; densité et longueur réduites quand Luma est mouillée. Coques de fourrure limitées selon le profil graphique.
- Crâne plus arrondi, yeux moins saillants et reflets cornéens plus discrets ; taches plus petites et irrégulières.
- Roche côtière sculptée en strates, cavités et coulures de végétation ; contour des collisions conservé sur le relief rendu.
- Raccord des nageoires arrière solidaire de leur articulation ; correction de séparation aux sommets des contours côtiers fermés.
- Lumière plus chaude et contrastée, ciel bleu plus soutenu, sable ondulé, galets et herbes plus fines.

Le modèle et le décor restent procéduraux. Cette passe rapproche leur aspect de la fiche ; elle n’en atteint pas encore la qualité finale.

## [0.3.0] - 2026-10-06

### Ajouté

- Corps continu de Luma, rig de tête et d’arrière-train, posture de plage et transition amortie vers la nage.
- Cartes de pelage gris tacheté, ventre et museau crème, microrelief de poil et réponse au mouillage.
- Yeux sombres réfléchissants, clignement cohérent, moustaches courbes et nageoires profilées.
- Falaises stratifiées, arches maçonnées, tours ruinées, mousses et cascades en 3D.
- Tests du modèle et des collisions côtières ; captures JPEG réelles avec métadonnées de build sur une branche de revue.

### Amélioré

- Rivage sableux avec grain, rochers érodés, herbes courbées, nuages chauds et relief de calcaire ; lumière et brouillard ajustés d’après les captures réelles.
- Caméra rapprochée et environnement de réflexion.
- Collisions côtières suivant le contour visible à la profondeur du phoque.
- Animation de Luma pendant l’introduction et le soin ; écran de soin avec le vrai personnage 3D et une caméra rapprochée.
- Correction d’un identifiant GLSL réservé qui empêchait le shader d’eau de compiler.
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
