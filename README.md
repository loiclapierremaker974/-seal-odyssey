# Seal Odyssey — Aqualys et Luma

Cette arborescence est une reprise locale propre de **Seal Odyssey** : une vertical slice Web/Three.js pensée d'abord pour l'iPhone en paysage, installable comme PWA.

[![Test and deploy Seal Odyssey](https://github.com/loiclapierremaker974/-seal-odyssey/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/loiclapierremaker974/-seal-odyssey/actions/workflows/deploy-pages.yml)

> [!IMPORTANT]
> Le dossier maître décrit une bêta avancée et cite un ancien dépôt GitHub, mais ni les sources de cette bêta, ni son archive ZIP, ni un dépôt exploitable n'étaient présents dans la transmission du 2 octobre 2026. Cette fondation ne prétend donc pas être cette bêta. La version 0.3.1 affine Luma (pelage court en volume, yeux et crâne) et les falaises d’Aelys à partir de la fiche visible du 6 octobre. Les modèles restent procéduraux et la qualité de l’illustration reste une cible artistique.

Les dossiers de référence transmis par le créateur restent des sources de travail privées. Ils ne sont pas intégrés comme assets de production : leur provenance et leur usage final doivent d'abord être confirmés. Les exécutables sans rapport avec le jeu ont été laissés intacts.

## Démarrage local

Prérequis : Node.js 20.19 ou plus récent et pnpm 11.

```sh
pnpm install
pnpm dev
```

Ouvrir ensuite l'URL indiquée par Vite, généralement `http://localhost:5173`.

```sh
pnpm test
pnpm build
pnpm preview
```

- `pnpm test` lance les tests natifs Node des modules de domaine.
- `pnpm build` produit la version publiable dans `dist/`.
- `pnpm preview` sert cette build, généralement sur `http://localhost:4173`.

Le service worker est enregistré uniquement dans une build de production. Une installation PWA sur iPhone exige une origine HTTPS (ou `localhost` sur la machine qui sert le site). Pour le plein écran le plus fiable sur iOS, ouvrir l'URL publiée dans Safari, utiliser **Partager → Sur l'écran d'accueil**, puis lancer l'icône en mode paysage.

## Commandes

| Contexte | Commande | Effet |
| --- | --- | --- |
| Tactile gauche | Joystick | Se déplacer sur terre ou nager |
| Tactile droit | Zone caméra | Orienter la caméra |
| Action | Bouton `Action` | Interagir, récupérer un Écho ou activer le Site Ancien |
| Eau | Bouton `Plonger` | Plonger ou remonter selon le contexte de jeu |
| Déplacement | Bouton `Sprint` | Courir ou nager plus vite en consommant de l'énergie |
| Relation | Bouton `Soin` | Ouvrir/déclencher l'interaction de soin disponible |
| Clavier | `WASD` ou flèches | Se déplacer |
| Souris | Glisser sur la scène | Orienter la caméra |
| Clavier | `E`, `F` ou `Entrée` | Action |
| Clavier | `Q`, `C` ou `Ctrl` | Plonger |
| Clavier | `Espace` ou `R` | Remonter |
| Clavier | `Maj` | Sprinter |

Les contrôles tactiles sont de vrais boutons accessibles au clavier. Les jauges d'oxygène et d'énergie, l'objectif, les trois Échos et l'identifiant de build sont exposés avec des rôles et libellés sémantiques.

## Architecture

Le prototype sépare le domaine, les entrées et le rendu afin qu'une éventuelle bêta retrouvée puisse être comparée puis migrée sans réécrire les règles du jeu.

```text
index.html                     point d'entrée PWA et inscription du service worker
public/
  manifest.webmanifest         installation, paysage, couleurs et icônes
  service-worker.js            cache versionné et mise à jour consentie
src/
  main.js                      composition de la scène et boucle d'application
  styles.css                   interface plein écran, safe areas et contrôles mobiles
  config/gameplay.js           constantes de rendu, monde, mouvement et caméra
  core/GameState.js            progression, jauges, Échos et état sérialisable
  persistence/SaveStore.js     sauvegarde locale versionnée et migration
  player/InputController.js    clavier, pointeur, tactile et commandes externes
  player/GuardianController.js locomotion terre/surface/profondeur
  seals/SealEntity.js          données et état d'un phoque
  care/CareSystem.js           interactions de soin et confiance
  audio/AqualysAudio.js        ambiance synthétisée, activation volontaire, pause
  world/createLumaProxy.js     peau continue, rig, pelage tacheté et mouillage
  world/createAelysBackdrop.js falaises stratifiées, arches et cascades
  world/coastalCollision.js    volumes côtiers solides et limites de la lagune
  world/createAelysWater.js    eau, normales, profondeur et écume littorale
  ui/MobileHUD.js              HUD, introduction, contrôles et notification PWA
  ui/CarePanel.js              gestes tactiles de soin, préférences et feedback
docs/                          statut vérifié, canon, assets et décisions
tests/                         tests de domaine exécutés par `node --test`
```

`MobileHUD` ne dépend ni de Three.js ni de l'état du jeu. Il accepte un callback `onControl(control, active, value)` et émet aussi l'événement bouillonnant `seal:control`. Ses méthodes principales sont :

```js
hud.setVitals({ oxygen: 84, energy: 63, mode: 'Plongée' });
hud.setEchoes(1, 3);
hud.setObjective('Écouter l’Écho de la Lagune');
hud.setDebug({ Build: 'p0-local-0.1.0', Rendu: '60 fps' });
hud.showToast('Écho retrouvé', { tone: 'success' });
```

La configuration Vite utilise des URLs relatives par défaut pour pouvoir publier la même build à la racine d'un domaine ou dans un sous-chemin GitHub Pages. Une CI peut fournir `VITE_BASE_PATH` et `VITE_BUILD_ID` pendant la construction.

## Déploiement GitHub Pages

La fondation v0.1.0 a été publiée le 5 octobre 2026 : [ouvrir Seal Odyssey](https://loiclapierremaker974.github.io/-seal-odyssey/). Les nouvelles versions présentes dans une branche de travail ou une pull request ne remplacent pas cette publication.

Le workflow [Test and deploy Seal Odyssey](https://github.com/loiclapierremaker974/-seal-odyssey/actions/workflows/deploy-pages.yml) exécute les tests, construit la version de production avec le bon sous-chemin, puis la publie dès que Pages est activé. GitHub impose une activation administrative unique pour chaque nouveau dépôt : ouvrir [Settings → Pages](https://github.com/loiclapierremaker974/-seal-odyssey/settings/pages), choisir **GitHub Actions** comme source, puis relancer le workflow. Les publications suivantes sont automatiques à chaque push sur `main`.

## Ambiance et validation du rendu

Le bouton **Activer le son** lance une ambiance générée dans le navigateur après une action volontaire. **Couper le son** la rend silencieuse. Le choix est conservé localement quand le stockage est disponible. L’audio se suspend quand l’onglet est masqué et reste facultatif si le navigateur le refuse.

L’eau utilise une approximation du ciel, des normales animées et un champ de hauteur généré à partir du terrain d’Aelys. Ce rendu en une passe n’effectue pas de réflexion complète du décor ni de réfraction physique. Le pelage de Luma se mouille dans l’eau et sèche progressivement à terre, sans changer le schéma de sauvegarde.

Le workflow `validate-prototype.yml` vérifie les tests de domaine, la build et le démarrage réel des shaders en Chromium/SwiftShader, pour les branches de travail et les pull requests. Les captures et diagnostics sont conservés dans les artifacts de chaque run. Les JPEG de revue et leur SHA/statut source sont également disponibles dans la branche `seal-render-previews` ; ce sont des images du navigateur réel, pas des illustrations générées. Ce contrôle logiciel ne mesure pas les performances d’un véritable iPhone.

## PWA et mises à jour

Le cache porte un numéro de version dans `public/service-worker.js`. Lorsqu'un nouveau worker est installé, le HUD propose **Mettre à jour** ; la page ne bascule vers la nouvelle build qu'après cette action. Pour une prochaine publication :

1. mettre à jour la version du paquet et l'entrée du changelog ;
2. modifier `CACHE_VERSION` dans `public/service-worker.js` ;
3. exécuter les tests et une build propre ;
4. vérifier l'installation, le lancement hors ligne et la reprise après mise à jour sur un vrai iPhone.

## État et limites connues

- Il s'agit d'une fondation P0 locale, pas d'une restauration de l'« Ultimate Beta » décrite par le dossier.
- Luma possède un corps continu avec un petit rig, des cartes de pelage générées, un visage cohérent et des nageoires profilées. Les falaises et les ruines sont en 3D. La sculpture, la retopologie et les animations de production correspondant à la qualité de la fiche restent à réaliser.
- Une ambiance sonore procédurale accompagne la mer, l’immersion, les Échos et le soin. Les enregistrements et la musique de production restent absents.
- Le périmètre vise une boucle courte : locomotion, eau, jauges, trois Échos, Site Ancien, soin/confiance et sauvegarde. Le monde vivant complet, les lignées, la colonie, l'artisanat et la narration étendue restent hors P0.
- Les performances doivent encore être mesurées sur plusieurs générations d'iPhone. Le navigateur peut refuser le verrouillage d'orientation ou le plein écran ; l'installation sur l'écran d'accueil reste la voie iOS recommandée.
- Le dépôt distant associé est [`loiclapierremaker974/-seal-odyssey`](https://github.com/loiclapierremaker974/-seal-odyssey). Le workflow `.github/workflows/deploy-pages.yml` teste et construit le projet avant toute publication GitHub Pages.

Voir [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md), [docs/ASSET_INVENTORY.md](docs/ASSET_INVENTORY.md), [docs/CANON_SNAPSHOT.md](docs/CANON_SNAPSHOT.md) et [docs/decisions/0001-local-p0-bootstrap.md](docs/decisions/0001-local-p0-bootstrap.md) pour les constats et garde-fous de reprise.

## Propriété et canon

Le projet et son dossier maître sont attribués à Loïc Lapierre. Les noms, systèmes et contenus restent soumis au canon consolidé et aux validations de droits décrits dans le dossier maître. Ne pas intégrer d'asset externe dans une version distribuée sans licence vérifiée et archivée.
