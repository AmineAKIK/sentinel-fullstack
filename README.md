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
- `npm run verify:reliability` : vérifications de fiabilité atelier

Frontend :

- `npm run dev` : serveur Vite
- `npm run build` : typecheck puis build Vite
- `npm run preview` : prévisualisation du build

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

## Notes De Dépôt

Les dossiers `node_modules/`, `dist/` et les fichiers `.env` sont ignorés. Les dépendances se restaurent avec `npm install`, et les builds se régénèrent avec `npm run build`.
