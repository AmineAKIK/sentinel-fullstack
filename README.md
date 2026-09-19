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

**Première lecture / jury :** suivre le [guide depuis un clone neuf](docs/jury-quickstart.md).
Il détaille la création de la base, les secrets locaux et les commandes
PowerShell **et** Bash. Aucun accès au VPS ni compte de production n'est requis.
Les commandes ci-dessous sont en Bash ; chaque terminal part de la racine du dépôt.

```bash
git clone https://github.com/AmineAKIK/sentinel-fullstack.git
cd sentinel-fullstack
```

### Reproduire exactement la version présentée au jury

Le dossier de projet et les preuves associées se réfèrent à la release immuable
`v1.0.0-rc.9`, au commit
`ed26a25e3c005cabb0da30a4553dfbbee03afe81`. La branche `main` contient des
améliorations documentaires et de portabilité postérieures à ce candidat.

Pour examiner exactement la version présentée dans le dossier :

```bash
git fetch --tags
git switch --detach v1.0.0-rc.9
git rev-parse HEAD
```

Le SHA attendu est :

```text
ed26a25e3c005cabb0da30a4553dfbbee03afe81
```

Le mode `detached HEAD` est volontaire : il permet de reproduire le candidat
d'examen sans modifier une branche locale. Pour revenir ensuite sur l'état
courant du dépôt :

```bash
git switch main
```

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

Une observation publique datée du 30 juillet 2026 a montré un frontal Nginx
sur les ports 80/443, cohérent avec la **topologie B** documentée. Cette
observation historique ne prouve ni les fichiers Compose actuellement actifs,
ni les binds loopback, ni les images/digests internes. Le runbook B reste le
contrat normatif de déploiement public : trois fichiers Compose, images par
digest et aucune reconstruction locale lors d'une release certifiée.

```bash
cp .env.release.example .env
# Remplacer chaque placeholder et générer le hash bcrypt du code Board.
export BUILD_SHA="$(git rev-parse HEAD)"
cd backend
npm ci
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

La procédure complète, ainsi que l'exploitation quotidienne, se trouvent dans
[docs/production.md](docs/production.md).

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
termine par `_test` ou `_integration`, créée au préalable (voir le guide jury) :

```bash
export DATABASE_URL=postgres://sentinel:mot_de_passe@localhost:5432/sentinel_test
export NODE_ENV=test
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
```

Pour Playwright, suivre la [configuration E2E explicite](docs/jury-quickstart.md#tests-navigateur-e2e) :
une base dédiée **dont le nom se termine par `_e2e`** et les variables de test
sont obligatoires. Ne jamais utiliser une base métier ou de production.
`test:e2e` applique les migrations, recrée les fixtures de cette base isolée,
puis démarre trois serveurs sur `3100`, `5174` et `5175` (origine sœur pour
les tests CSRF). Il ne réutilise jamais un serveur existant.

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

Les cinq documents de référence pour le jury sont :

- [Collaboration](docs/collaboration.md) — règles de changement, contrôles
  locaux, gouvernance GitHub
- [Conception](docs/conception.md) — cadrage fonctionnel, acteurs, cycle de
  vie complet des incidents
- [Design](docs/design.md) — doctrine d'expérience, principes P1-P7,
  historique du chantier UX
- [Technique](docs/technique.md) — architecture, configuration, sécurité
  applicative, modèle de données, jeu d'essai
- [Production](docs/production.md) — déploiement, exploitation, checklist de
  publication, protocole et preuves de production datées

La [politique de sécurité](SECURITY.md) complète ces références.

### Statut et historique de stabilisation

- [Vérification RC9 du 17 septembre 2026](docs/rc9-verification-2026-09-17.md) —
  release, CI et observation publique datées, avec limites de la vérification
- [Préparation de release](docs/release-readiness.md) — portes RC9 et règle de
  lecture des preuves historiques ; ce fichier n'est pas une source métier
- [Résultats d'audit](docs/audit-prod-resultats.md) — index historique ; les
  verdicts et métriques anciens restent attachés à leur candidat et à leur date
- [Archives RC](docs/archive-rc/) — registres et audits des candidats
  antérieurs, conservés comme preuve du processus itératif

Le tag immuable `v1.0.0-rc.9` désigne
`ed26a25e3c005cabb0da30a4553dfbbee03afe81`. Les améliorations de documentation
et de portabilité postérieures n'altèrent pas ce tag ni la production.
Consulter la vérification datée ci-dessus ; une ancienne preuve RC8 n'est
pas une preuve RC9 et la branche `main` peut évoluer après une release.

## Licence

Distribué sous licence MIT. Voir [LICENSE](LICENSE).
