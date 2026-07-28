# Liste des captures à réaliser — Dossier de projet DWWM

> Une instance existe sur `sentinel.akiksystems.fr`, mais aucune capture de
> cette instance ne constitue une preuve RC4 tant que le SHA RC4 n'a pas été
> explicitement autorisé, déployé et vérifié. Chaque ligne ci-dessous précise l'écran,
> l'état exact à afficher après ce futur déploiement, et ce que la capture doit démontrer pour le jury.
> Format recommandé : PNG, viewport desktop 1440×900 sauf mention "mobile" (viewport 390×844,
> DevTools en mode responsive suffit — pas besoin d'un vrai téléphone).
>
> Une fois capturées : import via l'extension html.to.design dans Figma pour la partie maquettes
> (chapitre 5 du dossier), et insertion directe des mêmes captures (ou de captures équivalentes en
> conditions réelles) aux chapitres 8, 12 et en annexe.

## Desktop

| # | Écran | URL | État à afficher | Ce que ça démontre |
|---|---|---|---|---|
| 1 | Portail | `/login` | Les 3 blocs Board / Administration / Workshop visibles | Point d'entrée unique, séparation des espaces |
| 2 | Connexion atelier — 1er accès | `/workshop/login` | Formulaire avec champ "Code temporaire" visible (badge d'un compte jamais connecté) | Flux de premier accès sécurisé |
| 3 | Connexion atelier — standard | `/workshop/login` | Formulaire badge + mot de passe (état normal) | Flux de connexion courant |
| 4 | Dashboard — vue OPERATOR | `/workshop/dashboard` | Connecté en OPERATOR, quelques incidents visibles, actions limitées (pas de bouton "Clôturer") | Permissions différenciées par rôle |
| 5 | Dashboard — vue MAINTENANCE | `/workshop/dashboard` | Connecté en MAINTENANCE, boutons "Prendre en charge" / "Clôturer" visibles | Permissions différenciées par rôle |
| 6 | Dashboard — vue Responsable | `/workshop/dashboard` | Connecté en Responsable, section arbitrage/demandes visible si une demande est en attente | Permissions différenciées par rôle |
| 7 | Modale de création d'incident | `/workshop/dashboard` | Modale ouverte, formulaire avec sélection ligne/machine/robot/tête/état | Validation dynamique, UX de saisie rapide |
| 8 | Détail d'un incident (drawer) | `/workshop/dashboard?incident=X` | Un incident sélectionné, drawer ouvert avec dossier complet | Richesse d'information, actions contextuelles |
| 9 | Board grand écran | `/board` (après code) | Vue lecture seule avec plusieurs incidents actifs, niveaux d'attention visibles | Doctrine UX (P1 — hiérarchie sans agression), lecture de loin |
| 10 | Pilotage | `/workshop/pilotage` | Indicateurs et graphiques avec des données réelles | Analytique, requêtes SQL complexes |
| 11 | Historique — dossier incident | `/workshop/history?incident=X` | Un incident sélectionné, trace complète visible | Traçabilité, audit trail |
| 12 | Journal (vue Responsable) | `/workshop/journal` | Connecté en Responsable, tableau d'événements avec filtres | Permission par rôle au niveau écran entier |
| 13 | Base de connaissance | `/workshop/knowledge` | Une fiche d'intervention sélectionnée avec section "Déjà résolu ailleurs" | Capitalisation, cas similaires |
| 14 | Admin — liste des comptes | `/admin/users` | Liste avec quelques comptes de rôles différents | Gestion référentiel |
| 15 | Admin — détail d'un compte | `/admin/users/:id` | Détail d'un compte avec historique d'audit | Traçabilité admin |
| 16 | Admin — gestion des lignes | `/admin/lines` | Une ligne avec sa séquence de machines | Modélisation JSONB visible en usage |
| 17 | Admin — journal d'audit | `/admin/audit` | Quelques événements d'audit référentiel | Journal factuel, neutre (P6 doctrine) |
| 18 | Page confidentialité | `/confidentialite` | Contenu de la page RGPD | Preuve d'implémentation RGPD visible |

## Mobile (viewport 390×844)

| # | Écran | URL | État à afficher | Ce que ça démontre |
|---|---|---|---|---|
| 19 | Portail (mobile) | `/login` | Les 3 blocs empilés verticalement | Adaptation responsive |
| 20 | Dashboard (mobile) | `/workshop/dashboard` | Liste d'incidents empilée, drawer en plein écran si un incident est ouvert | Layout adaptatif du drawer de détail |
| 21 | Création d'incident (mobile) | `/workshop/dashboard` | Modale de création en plein écran mobile | Formulaire utilisable au doigt |
| 22 | Board (mobile) | `/board` | Cartes empilées | Board consultable hors poste fixe |

## Captures fonctionnelles complémentaires (jeu d'essai, chapitre 12)

| # | Contenu | Comment l'obtenir |
|---|---|---|
| 23 | Réponse API 200 d'une création d'incident | DevTools → onglet Réseau, capturer la requête `POST /api/workshop/incidents` |
| 24 | Réponse API 403 d'une action refusée | Se connecter en OPERATOR, tenter de clôturer un incident via l'UI (le bouton n'existe pas : utiliser un client HTTP comme Postman/Insomnia ou `curl` avec le cookie de session) |
| 25 | Interface après clôture d'un incident | Dashboard, incident clôturé visible avec sa note d'intervention |

## CI / qualité (chapitre 13)

| # | Contenu | Comment l'obtenir |
|---|---|---|
| 26 | Run GitHub Actions vert | Capturer le SHA RC4 exact et les six jobs verts : Backend/Frontend Quality, PostgreSQL integration, Browser, Containers et Backup/restore |

## Preuves externes RC4 à ne produire qu'après autorisation

| # | Preuve | État exact requis |
|---|---|---|
| 27 | Version déployée | `/api/health` en HTTP 200 avec `version` égale au SHA du tag RC4 |
| 28 | En-têtes HTTPS | Sortie de `verify-public-headers.sh` : valeurs uniques sur `/login` et `/api/health`, barrière absente |
| 29 | Courriel multipart | Message reçu dans une vraie boîte : alternatives texte et HTML, lien same-origin correct, aucune image distante obligatoire |
| 30 | Provenance des images | Digests backend/frontend de la prerelease et labels OCI `revision` égaux au merge RC4 |
| 31 | Sauvegarde avant déploiement | Nom horodaté, checksum vérifié et copie hors site confirmée, sans afficher de secret |
| 32 | Recette multi-rôle | Admin, Atelier et Board sur la RC4 réellement servie ; motif, correction, annulation et Historique visibles |

Les captures 1 à 25 doivent elles aussi être reprises sur cette même RC4. Une
capture RC3, locale ou issue d'un autre SHA peut illustrer une maquette, mais
doit être légendée comme telle et ne jamais être attribuée à la candidate RC4.
