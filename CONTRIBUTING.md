# Contribuer à Sentinel

## Prérequis

- Node.js `24.18.0` (`nvm use` lit `.nvmrc`) ;
- npm `11.16.0` (fourni avec cette version de Node.js) ;
- PostgreSQL 15 pour l'intégration ;
- Chromium Playwright pour les parcours E2E.

Installer avec `npm ci` dans `backend/` et `frontend/`. Ne jamais versionner les
fichiers `.env`, les données, les exports, les dossiers de couverture ou les
artefacts Playwright.

## Règles de changement

1. garder controllers, services, policies et repositories séparés ;
2. placer les règles d'autorisation dans la policy backend ;
3. mettre à jour le miroir frontend et ses tests lorsqu'une permission change ;
4. utiliser Zod et les requêtes SQL paramétrées ;
5. verrouiller et transactionner les mutations concurrentes ;
6. ne pas écrire d'événement pour un no-op ;
7. ajouter une migration au lieu de modifier une migration publiée ;
8. mettre à jour la documentation lorsqu'un contrat utilisateur change.

## Contrôles locaux

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

Avec PostgreSQL dédié, exécuter aussi les tests d'intégration et
`frontend/npm run test:e2e`. La checklist complète est dans
`docs/release-checklist.md`.

## Commits et revue

- un commit porte une intention cohérente ;
- le message décrit le résultat, pas la mécanique ;
- aucun changement utilisateur existant n'est écrasé ;
- la revue recherche d'abord régressions, sécurité, concurrence et tests manquants ;
- le push n'est terminé qu'après validation de la CI distante.
