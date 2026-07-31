# Collaboration Sentinel

Ce document décrit comment le dépôt est développé, contrôlé et publié : les
règles de changement, les contrôles locaux à exécuter avant de pousser, et la
gouvernance réellement active sur GitHub.

## Prérequis

- Node.js `24.18.0` (`nvm use` lit `.nvmrc`) ;
- npm `11.16.0`, fourni avec cette version de Node.js ;
- PostgreSQL 15 pour l'intégration ;
- Chromium Playwright pour les parcours E2E.

Installer avec `npm ci` dans `backend/` et `frontend/`. Ne jamais versionner
les fichiers `.env`, les données, les exports, les dossiers de couverture ou
les artefacts Playwright.

## Règles de changement

1. garder controllers, services, policies et repositories séparés ;
2. placer les règles d'autorisation dans la policy backend, jamais côté client
   seul ;
3. mettre à jour le miroir frontend et ses tests lorsqu'une permission change ;
4. utiliser Zod et les requêtes SQL paramétrées ;
5. verrouiller et transactionner les mutations concurrentes ;
6. ne pas écrire d'événement d'audit pour un no-op ;
7. ajouter une migration au lieu de modifier une migration déjà publiée ;
8. mettre à jour la documentation lorsqu'un contrat utilisateur change.

## Contrôles locaux avant de pousser

Backend :

```bash
cd backend
npm run format:check
npm run lint
npm run typecheck:scripts
npm run build
npm run test:coverage
npm run verify:reliability
```

Frontend :

```bash
cd frontend
npm run format:check
npm run lint
npm run build
npm run test:coverage
```

Avec un PostgreSQL dédié, exécuter aussi les tests d'intégration
(`npm run test:integration`) et les parcours navigateur
(`cd frontend && npm run test:e2e`). La checklist complète avant publication
est dans [production.md](production.md).

## Commits et revue

- un commit porte une intention cohérente ;
- le message décrit le résultat, pas la mécanique ;
- aucun changement utilisateur existant n'est écrasé sans raison documentée ;
- la revue recherche d'abord régressions, sécurité, concurrence et tests
  manquants ;
- le push n'est considéré terminé qu'après validation de la CI distante.

## Gouvernance GitHub

Le dépôt est mono-mainteneur (`AmineAKIK`, seul collaborateur, aucune
invitation en attente). Les règles distantes sont écrites pour ce profil, pas
pour simuler une équipe qui n'existe pas.

### Branche `main`

Un ruleset actif protège `refs/heads/main`, sans acteur de bypass :

- suppression et force-push bloqués ;
- pull request obligatoire avant fusion ;
- conversations non résolues bloquantes, approbations obsolètes invalidées ;
- branche à jour exigée avant fusion ;
- fusion par merge commit uniquement (l'historique linéaire est
  volontairement désactivé : Sentinel publie après une vraie fusion, pas un
  squash ou un rebase) ;
- six checks stricts requis, rattachés à l'application GitHub Actions :
  1. `Backend / Quality` ;
  2. `Frontend / Quality` ;
  3. `Backend / PostgreSQL integration` ;
  4. `Browser / Critical journeys` ;
  5. `Containers / Production contract` ;
  6. `Ops / Backup and restore drill`.

Le nombre d'approbations requis est volontairement fixé à `0` : sur un dépôt à
mainteneur unique, exiger un second reviewer humain serait soit impossible,
soit une case cochée sans substance. La barrière réelle est ailleurs — les six
checks CI, pas une signature.

Un réglage antérieur imposait une revue à deux personnes et une identité
technique dédiée pour contourner l'interdiction de création de tags, ce qui
était incohérent avec un dépôt à mainteneur unique. Il a été corrigé le
30 juillet 2026 pour refléter le fonctionnement réel décrit ci-dessus. L'objet
de ruleset correspondant à l'ancien réglage tag est conservé, désactivé,
comme trace de la correction.

### Tags de version

Deux rulesets ciblent `refs/tags/v*` :

- création : ouverte au propriétaire ;
- immutabilité : mise à jour et suppression interdites, sans bypass, dès
  qu'un tag existe.

Le workflow de publication ne réagit jamais à un `push` de tag — un tag posé
sur un ancien commit pourrait charger une ancienne politique de workflow. La
publication se lance uniquement par `workflow_dispatch` depuis `main`, avec le
tag existant fourni en entrée ; le collecteur exige que le commit pelé du tag,
le checkout et `origin/main` soient identiques avant toute action.

### Actions et permissions

- toutes les actions tierces sont épinglées par SHA complet, pas par tag ;
- seules les actions GitHub officielles et `docker/*` sont autorisées ;
- permissions par défaut du token : `contents: read` ; chaque job étend
  explicitement ce dont il a besoin (`attestations: write`,
  `packages: write`…), jamais plus large ;
- `Enable release immutability` est actif : une release publiée ne peut plus
  être réécrite.

### Environnement `prerelease`

La publication passe par un GitHub Environment `prerelease` sans reviewer
requis (mono-mainteneur), sans secret d'environnement propre, restreint à la
seule branche `main` comme politique de déploiement. Le garde de publication
relit cette configuration avant de planifier le job : un environnement
absent, mal nommé, avec une règle de reviewer fictive ou une politique de
branche plus large fait échouer la publication avant toute authentification
registre.

## Stabilisation en cours

Chaque lot de correction met à jour son état et ses preuves dans un registre
de préparation de release dédié, fermé uniquement au statut `VERIFIED` après
tests adaptés et CI verte. Les registres des candidats précédents (RC3, RC4,
RC5…) restent conservés comme preuve historique du processus, distincts de
l'état courant.
