# Sentinel - Administration des comptes utilisateurs

Application full-stack de gestion des comptes Sentinel.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + React Router v6
- **Backend**: Node.js + Express + TypeScript
- **Base de données**: PostgreSQL 15
- **Authentification**: JWT via cookie HTTP-only

## Démarrage rapide avec Docker Compose

```bash
cd sentinel
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Identifiants par défaut: `admin` / `admin123`

## Développement local

### Prérequis

- Node.js 20+
- PostgreSQL 15 (ou via Docker)

### Backend

```bash
cd backend
cp .env.example .env   # adapter DATABASE_URL si besoin
npm install
npm run migrate        # exécute les migrations SQL
npm run dev            # démarre en mode watch
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Structure du projet

```
sentinel/
├── backend/
│   ├── migrations/          # Fichiers SQL de migration
│   ├── src/
│   │   ├── db/              # Pool PostgreSQL, migrate, seed
│   │   ├── middlewares/     # adminAuth JWT middleware
│   │   ├── modules/
│   │   │   ├── adminAuth/   # Login / logout / me
│   │   │   └── accounts/   # CRUD comptes Sentinel
│   │   ├── utils/           # Gestion d'erreurs
│   │   └── server.ts        # Point d'entrée Express
│   └── ...
└── frontend/
    └── src/
        ├── api/             # Clients HTTP (auth, accounts)
        ├── components/      # Modal, formulaires, NavBar
        ├── pages/           # Login, UserList, UserDetail
        ├── routes/          # AuthContext, ProtectedRoute
        └── types/           # Types TypeScript partagés
```

## API

### Authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | /api/admin/auth/login | Connexion admin |
| GET | /api/admin/auth/me | Infos admin courant |
| POST | /api/admin/auth/logout | Déconnexion |

### Comptes (protégées par JWT cookie)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | /api/admin/accounts | Liste (filtres: role, sort, order) |
| POST | /api/admin/accounts | Créer un compte |
| GET | /api/admin/accounts/:id | Détail d'un compte |
| PATCH | /api/admin/accounts/:id | Mise à jour partielle |
| PATCH | /api/admin/accounts/:id/activate | Activer |
| PATCH | /api/admin/accounts/:id/deactivate | Désactiver |
| DELETE | /api/admin/accounts/:id | Suppression logique |

## Variables d'environnement

### Backend

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| PORT | 3000 | Port d'écoute |
| DATABASE_URL | postgres://... | URL PostgreSQL |
| ADMIN_USERNAME | admin | Identifiant admin initial |
| ADMIN_PASSWORD | admin123 | Mot de passe admin initial |
| JWT_SECRET | - | Secret JWT (à changer en production) |
| COOKIE_SECRET | - | Secret cookie (à changer en production) |
| CLIENT_ORIGIN | http://localhost:5173 | Origine CORS autorisée |

### Frontend

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| VITE_API_URL | http://localhost:3000 | URL de l'API backend |

## Sécurité

- Authentification par cookie HTTP-only uniquement (pas de token localStorage)
- Suppression logique uniquement (is_deleted=true, jamais de DELETE SQL)
- Toutes les actions sensibles créent un événement d'audit (table account_audit_events)
- Le hash du mot de passe n'est jamais retourné au frontend
- Validation Zod côté backend sur toutes les entrées
