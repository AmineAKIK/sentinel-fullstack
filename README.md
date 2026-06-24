# Sentinel

Application full-stack de pilotage Sentinel organisee autour de trois espaces : Board, Administration et Workshop.

## Stack

- Frontend : React 18, TypeScript, Vite, React Router
- Backend : Node.js, Express, TypeScript
- Base de données : PostgreSQL
- Authentification : JWT en cookie HTTP-only

## Démarrage Docker

Le `docker-compose.yml` démarre un environnement local par défaut.

```bash
docker compose up --build
```

- Frontend : http://localhost:5173
- Backend API : http://localhost:3000
- Portail : http://localhost:5173/login
- Board : http://localhost:5173/board
- Admin local par defaut : `admin` / `admin123`

Pour une publication, copier `.env.release.example` vers `.env` sur l'hôte de déploiement et remplacer toutes les valeurs sensibles avant de lancer Docker Compose. En `NODE_ENV=production`, le backend refuse de démarrer si les secrets ou l'origine client restent sur des valeurs de démonstration.

## Développement Local

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Scripts

Backend :

- `npm run dev` : API en mode watch
- `npm run build` : compilation TypeScript vers `dist/`
- `npm run start` : démarre `dist/server.js`
- `npm run migrate` : exécute les migrations SQL
- `npm run lint` : analyse statique ESLint
- `npm test` : tests unitaires et d'intégration (Jest)
- `npm run verify:reliability` : vérifications de fiabilité atelier
- `npm run seed:demo` : jeu de données de démonstration atelier
- `npm run seed:e2e` : jeu de données dédié aux tests end-to-end

Frontend :

- `npm run dev` : serveur Vite
- `npm run build` : typecheck puis build Vite
- `npm run preview` : prévisualisation du build
- `npm run lint` : analyse statique ESLint
- `npm test` : tests unitaires et composants (Vitest)
- `npm run test:e2e` : tests end-to-end (Playwright) — re-seed puis exécution

## Tests End-to-End

Les parcours critiques sont couverts par Playwright (dossier `frontend/e2e/`).
La suite démarre les serveurs au besoin (réutilise ceux déjà lancés) et
s'appuie sur un jeu de données dédié recréé à chaque exécution.

```bash
cd frontend
npm run test:e2e        # re-seed (backend) puis exécution Playwright
```

Pré-requis : une base PostgreSQL accessible (cf. `backend/.env`) et les
bibliothèques système du navigateur. Sous Debian/Ubuntu :

```bash
sudo npx playwright install-deps chromium
# ou, si la commande sudo n'a pas npx dans son PATH :
sudo apt-get install -y libnss3 libnspr4 libasound2
```

## Publication

Avant de déclarer une version publiable :

```bash
cd backend
npm run build
npm test
npm run verify:reliability

cd ../frontend
npm run build
npm test
npm run test:e2e
```

Puis exécuter la recette manuelle et les contrôles de configuration décrits dans [docs/release-checklist.md](docs/release-checklist.md).

## Structure

```text
backend/
  migrations/      Migrations SQL PostgreSQL
  scripts/         Scripts de seed/vérification
  src/
    db/            Pool, migrations, seed admin
    middlewares/   Auth admin et atelier
    modules/       Auth, comptes, lignes, atelier, audit admin
    utils/         Gestion d'erreurs

frontend/
  src/
    api/           Clients HTTP
    components/    Modals, formulaires, navigations, filtres
    pages/         Pages admin et atelier
    routes/        Contextes/protections d'authentification
    utils/         Labels, permissions, helpers historique
```

## Routes Principales

Portail :

- `/login` — entree unique en trois blocs : Board, Administration, Workshop
- `/admin/login` — connexion administration depuis le portail
- `/workshop/login` — connexion atelier depuis le portail

Board :

- `/board` — affichage atelier lecture seule protege par code local

Administration :

- `/admin/accueil`
- `/admin/users`
- `/admin/users/:id`
- `/admin/lines`
- `/admin/audit`
- `/admin/support`

Workshop :

- `/workshop/dashboard`
- `/workshop/pilotage`
- `/workshop/history`
- `/workshop/knowledge`
- `/workshop/support`

API :

- `/api/auth` — session unifiee admin/workshop
- `/api/board` — session board et donnees lecture seule
- `/api/admin` — administration protegee
- `/api/workshop` — atelier protege

## Variables D'environnement

Backend : voir [backend/.env.example](backend/.env.example).

Frontend : voir [frontend/.env.example](frontend/.env.example).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Doctrine d'expérience (UX)](docs/doctrine-ux.md)
- [Analyse & plan d'application UX](docs/plan-ux.md)
- [Cycle de vie des incidents](INCIDENT_LIFECYCLE.md)
- [Cadrage fonctionnel](docs/cadrage-fonctionnel.md)
- [Documentation technique](docs/documentation-technique.md)
- [Jeu d'essai](docs/jeu-essai.md)
- [Tests manuels](docs/manual-tests.md)
- [Déploiement sur VPS](docs/deploiement-vps.md)
- [Runbook d'exploitation](docs/runbook.md)
- [Checklist de publication](docs/release-checklist.md)
- [Audit & stress-test de mise en production](docs/audit-prod.md)
- [Résultats d'audit de mise en production](docs/audit-prod-resultats.md)

## Notes De Dépôt

Les dossiers `node_modules/`, `dist/` et les fichiers `.env` sont ignorés. Les dépendances se restaurent avec `npm install`, et les builds se régénèrent avec `npm run build`.

## Licence

Distribué sous licence MIT. Voir [LICENSE](LICENSE).
