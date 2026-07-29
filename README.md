# Sentinel

[![CI](https://github.com/AmineAKIK/sentinel-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/AmineAKIK/sentinel-fullstack/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-1f6b96.svg)](LICENSE)

**Instance publique de démonstration :** [sentinel.akiksystems.fr](https://sentinel.akiksystems.fr)

Sentinel est une application full-stack de suivi des incidents industriels. Elle
réunit trois points d'entrée dans un même portail :

- **Board** : affichage atelier en lecture seule, protégé par un code local ;
- **Administration** : comptes, lignes, paramètres, sécurité et audit ;
- **Atelier** : déclaration, traitement, arbitrage, pilotage et capitalisation.

## Stack

- Frontend : React 18, TypeScript, Vite 8, React Router, Vitest et Playwright
- Backend : Node.js 24, Express, TypeScript, Jest et Zod
- Données : PostgreSQL 15, SQL paramétré et migrations versionnées
- Production : Docker Compose et Nginx non-root, avec Caddy intégré en
  topologie autonome ou Nginx hôte sur l'instance publique
- Sessions : JWT signés en cookies HTTP-only, séparés par audience

## Démarrage local

Prérequis : Node.js 24.18.0, npm 11.16.0 et PostgreSQL 15+.

```bash
# Terminal 1 : API
cd backend
cp .env.example .env
# Adapter DATABASE_URL, ADMIN_PASSWORD et les secrets locaux.
npm ci
npm run migrate
npm run dev

# Terminal 2 : interface
cd frontend
cp .env.example .env
npm ci
npm run dev
```

L'application est alors disponible sur `http://localhost:5173` et l'API sur
`http://localhost:3000/api`.

Le premier démarrage d'une **base vide** utilise `ADMIN_USERNAME` et
`ADMIN_PASSWORD` pour créer l'unique compte administrateur. Ces deux variables
sont des paramètres d'amorçage : elles peuvent être retirées après création du
compte. Aucun identifiant de démonstration n'est fourni par le Compose de
production.

## Déploiement Docker

Le Compose racine décrit la **topologie A autonome**. Seul Caddy publie les
ports `80` et `443`; PostgreSQL, l'API et Nginx restent sur des réseaux
internes. La commande ci-dessous sert à cette distribution autonome ou à une
validation locale, pas à l'instance publique.

L'instance publique utilise la **topologie B** avec Nginx hôte : Caddy y est
désactivé, les deux services applicatifs sont liés au loopback, et les images
de registry sont déployées par digest avec les trois fichiers Compose du
runbook. Elle n'est jamais reconstruite avec la commande `--build` ci-dessous.

```bash
cp .env.release.example .env
# Remplacer chaque placeholder et générer le hash bcrypt du code Board.
export BUILD_SHA="$(git rev-parse HEAD)"
cd backend
BOARD_ACCESS_CODE='code-board-temporaire' npm run hash:board
cd ..

docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail https://votre-domaine.example/api/health
```

Le frontend appelle `/api` sur sa propre origine ; `VITE_API_URL` reste vide
avec les deux proxies documentés. Le backend refuse de démarrer en production
si un secret requis, l'origine HTTPS, le proxy de confiance, le hash bcrypt
Board ou le SHA déployé sont invalides. `/api/health` publie ce SHA pour vérifier
l'alignement du VPS.

La procédure complète se trouve dans
[docs/deploiement-vps.md](docs/deploiement-vps.md) et l'exploitation quotidienne
dans [docs/runbook.md](docs/runbook.md).

## Qualité

### Backend

```bash
cd backend
npm ci
npm run format:check
npm run lint
npm run typecheck:scripts
npm run build
npm run test:coverage
npm run verify:reliability
```

Les tests d'intégration nécessitent une base PostgreSQL dédiée dont le nom se
termine par `_test` ou `_integration` :

```bash
export DATABASE_URL=postgres://sentinel:mot_de_passe@localhost:5432/sentinel_test
npm run test:integration
```

### Frontend et parcours navigateur

```bash
cd frontend
npm ci
npm run format:check
npm run lint
npm run build
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

`test:e2e` applique les migrations, recrée un jeu de données isolé, puis démarre
deux serveurs sur les ports réservés `3100` et `5174`. Il ne réutilise jamais un
serveur de développement existant.

GitHub Actions rejoue ces contrôles dans des jobs indépendants, ajoute les tests
PostgreSQL réels, les parcours Playwright mobiles, ShellCheck, la validation du
Compose et la construction des images non-root.

## Scripts utiles

Backend :

- `npm run migrate` : applique les migrations sous verrou PostgreSQL et vérifie leurs checksums ;
- `npm run reset:admin` : régénère le mot de passe de l'admin unique et invalide ses sessions ;
- `npm run hash:board` : produit le hash bcrypt d'un code Board ;
- `SENTINEL_DEMO_SEED_CONFIRM=RESET_ALL_WORKSHOP_INCIDENTS npm run seed:demo` : remplace explicitement tous les incidents par le jeu de démonstration ;
- `npm run seed:e2e` : recrée les fixtures Playwright déterministes.

Exploitation :

- `./scripts/backup.sh` : dump PostgreSQL compressé, atomique et accompagné d'un checksum ;
- `./scripts/restore.sh backups/<fichier>.sql.gz` : restauration validée dans une base temporaire avant bascule.

## Structure

```text
backend/
  migrations/       migrations PostgreSQL immuables
  scripts/          seeds et contrôles structurels
  src/
    auth/            JWT, cookies, mots de passe et payloads de session
    db/              pool, runner de migrations et bootstrap admin
    middlewares/     authentification, sécurité et rate limiting
    modules/         cas d'usage métier et accès aux données

frontend/
  e2e/               parcours Playwright
  src/
    api/              client HTTP typé et annulable
    components/       composants et modales accessibles
    hooks/            orchestration des données et mutations
    pages/            espaces Administration, Board et Atelier
    routes/           sessions et gardes de navigation
```

## Routes principales

- `/login` : portail des trois espaces
- `/board` : Board atelier lecture seule
- `/admin/*` : administration protégée
- `/workshop/dashboard` : traitement opérationnel
- `/workshop/pilotage` : indicateurs et tendances
- `/workshop/history` : dossiers clôturés et traces
- `/workshop/journal` : événements transverses
- `/workshop/knowledge` : interventions capitalisées
- `/workshop/support` : assistance contextuelle
- `/api/auth`, `/api/admin`, `/api/board`, `/api/workshop` : API correspondantes

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Cycle de vie des incidents](INCIDENT_LIFECYCLE.md)
- [Cadrage fonctionnel](docs/cadrage-fonctionnel.md)
- [Documentation technique](docs/documentation-technique.md)
- [Doctrine UX](docs/doctrine-ux.md)
- [Jeu d'essai](docs/jeu-essai.md)
- [Tests manuels](docs/manual-tests.md)
- [Déploiement VPS](docs/deploiement-vps.md)
- [Runbook d'exploitation](docs/runbook.md)
- [Checklist de publication](docs/release-checklist.md)
- [Préparation de la release v1.0.0](docs/release-readiness.md)
- [Protocole d'audit production](docs/audit-prod.md)
- [Derniers résultats d'audit](docs/audit-prod-resultats.md)
- [Politique de sécurité](SECURITY.md)
- [Guide de contribution](CONTRIBUTING.md)

## Licence

Distribué sous licence MIT. Voir [LICENSE](LICENSE).
