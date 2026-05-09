# Sentinel

Application full-stack de pilotage Sentinel : administration des comptes et lignes, exploitation atelier, suivi des incidents, affichage grand écran, historique, pilotage et base de connaissance.

## Stack

- Frontend : React 18, TypeScript, Vite, React Router
- Backend : Node.js, Express, TypeScript
- Base de données : PostgreSQL
- Authentification : JWT en cookie HTTP-only

## Démarrage Docker

```bash
docker compose up --build
```

- Frontend : http://localhost:5173
- Backend API : http://localhost:3000
- Admin par défaut : `admin` / `admin123`

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

Admin :

- `/admin/login`
- `/admin/accueil`
- `/admin/users`
- `/admin/users/:id`
- `/admin/lines`
- `/admin/audit`

Atelier :

- `/workshop`
- `/workshop/dashboard`
- `/workshop/board`
- `/workshop/history`
- `/workshop/pilotage`
- `/workshop/knowledge`

## Variables D'environnement

Backend : voir [backend/.env.example](backend/.env.example).

Frontend : voir [frontend/.env.example](frontend/.env.example).

## Notes De Dépôt

Les dossiers `node_modules/`, `dist/` et les fichiers `.env` sont ignorés. Les dépendances se restaurent avec `npm install`, et les builds se régénèrent avec `npm run build`.
