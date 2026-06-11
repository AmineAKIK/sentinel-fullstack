# Documentation Technique — Sentinel v1

> Version : 1.0 — Juin 2026

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Structure du projet](#2-structure-du-projet)
3. [Stack technique et dépendances](#3-stack-technique-et-dépendances)
4. [Configuration et variables d'environnement](#4-configuration-et-variables-denvironnement)
5. [Infrastructure Docker](#5-infrastructure-docker)
6. [Base de données](#6-base-de-données)
7. [Backend — Architecture](#7-backend--architecture)
8. [Backend — Authentification et sécurité](#8-backend--authentification-et-sécurité)
9. [Backend — Modules](#9-backend--modules)
10. [Frontend — Architecture](#10-frontend--architecture)
11. [Frontend — Types et contrats d'API](#11-frontend--types-et-contrats-dapi)
12. [Frontend — Gestion des permissions](#12-frontend--gestion-des-permissions)
13. [Tests](#13-tests)
14. [Démarrage en développement](#14-démarrage-en-développement)
15. [Déploiement en production](#15-déploiement-en-production)

---

## 1. Vue d'ensemble

Sentinel est une application full-stack Node.js/React. L'architecture est un monorepo à deux workspaces distincts (`backend/` et `frontend/`) orchestrés par Docker Compose.

```
sentinel/
├── backend/          Express + TypeScript + PostgreSQL
├── frontend/         React 18 + TypeScript + Vite
├── docker-compose.yml
└── docs/
```

Le backend expose une API REST JSON sur `/api/**`. Le frontend est une SPA React qui consomme cette API. En production, le frontend est servi par Nginx ; en développement, par le serveur Vite (port 5173).

---

## 2. Structure du projet

### 2.1 Backend

```
backend/
├── src/
│   ├── server.ts                    Point d'entrée — Express, middlewares, routing
│   ├── config/
│   │   └── production.ts            Validation des variables d'environnement en production
│   ├── db/
│   │   ├── pool.ts                  Pool de connexions PostgreSQL (node-postgres)
│   │   ├── migrate.ts               Système de migrations SQL (table schema_migrations)
│   │   ├── seed.ts                  Initialisation du compte admin au démarrage
│   │   ├── transaction.ts           Helper withTransaction<T>
│   │   └── sql.ts                   Utilitaires de construction SQL (sqlStringList, boundedInt…)
│   ├── auth/
│   │   ├── jwt.ts                   Signature et vérification JWT
│   │   ├── bcrypt.ts                Hachage des mots de passe (workshop × 10, admin × 12)
│   │   ├── authCookies.ts           Noms des cookies et options (httpOnly, sameSite, secure)
│   │   ├── authResponses.ts         Réponses HTTP d'erreur d'authentification
│   │   ├── session.ts               Durée de session (8 h)
│   │   └── setupCode.ts             Génération/vérification des setup codes (alphabet custom, 10 chars)
│   ├── middlewares/
│   │   ├── adminAuth.ts             Middleware JWT admin — injecte req.admin
│   │   ├── workshopAuth.ts          Middleware JWT atelier — injecte req.workshopUser
│   │   ├── loginRateLimit.ts        Rate limiting login (20 req / 15 min par IP+identité)
│   │   └── securityHeaders.ts       Headers HTTP sécurité (CSP, X-Frame-Options…)
│   ├── domain/
│   │   └── constants.ts             Enums TypeScript (rôles, statuts, états, actions)
│   ├── utils/
│   │   ├── errors.ts                Codes d'erreur API et sendError()
│   │   ├── serviceResult.ts         Type ServiceResult<T> (ok/error)
│   │   └── controller.ts            Helpers contrôleur (parseIdParam, sendServiceError, formatZodError)
│   └── modules/
│       ├── auth/                    Connexion unifiée admin/atelier
│       ├── adminCredentials/        Accès aux identifiants admin
│       ├── adminSecurity/           Confirmation/changement mot de passe admin
│       ├── admin/                   Dashboard et qualité référentiel
│       ├── accounts/                CRUD comptes atelier
│       ├── board/                   Session board lecture seule
│       ├── lines/                   CRUD lignes de production
│       ├── support/                 Assistant support admin/atelier
│       ├── workshopCredentials/     Credentials atelier internes
│       └── workshop/                Incidents, board, historique, pilotage, connaissance
├── migrations/                      021 fichiers SQL numérotés
├── scripts/                         Scripts utilitaires (seed demo, verifyReliability)
├── Dockerfile
├── package.json
└── tsconfig.json
```

### 2.2 Frontend

```
frontend/
├── src/
│   ├── App.tsx                      Routing React Router — déclaration de toutes les routes
│   ├── main.tsx                     Point d'entrée React
│   ├── styles.css                   CSS global
│   ├── types/
│   │   └── index.ts                 Tous les types partagés (Role, WorkshopIncident, Analytics…)
│   ├── api/
│   │   ├── client.ts                fetch wrapper (base URL, credentials, gestion erreurs)
│   │   ├── unifiedAuth.ts           API session unifiée admin/atelier
│   │   ├── adminSecurity.ts         API sécurité administration
│   │   ├── board.ts                 API session board lecture seule
│   │   ├── accounts.ts              API CRUD comptes
│   │   ├── lines.ts                 API CRUD lignes
│   │   ├── workshop.ts              API incidents, historique, pilotage, connaissance
│   │   ├── support.ts               API support admin/atelier
│   │   └── admin.ts                 API dashboard et qualité référentiel
│   ├── routes/
│   │   ├── AppAuthContext.tsx       Contexte session unifie admin/workshop
│   │   ├── AdminRoute.tsx           Guard administration
│   │   ├── WorkshopRoute.tsx        Guard workshop
│   │   └── GuestRoute.tsx           Guard des pages de connexion
│   ├── pages/                       12 pages (voir §10.2)
│   ├── components/                  ~40 composants (modales, cartes, formulaires, UI)
│   └── utils/
│       ├── workshopPermissions.ts   Miroir frontend de workshop.policy.ts
│       ├── labels.ts                Labels d'affichage des enums (shift, state, status, rôle)
│       ├── date.ts                  Formatage des dates et ancienneté
│       ├── lineMachines.ts          Helpers sélection machine/robot/tête
│       ├── workshopFilters.ts       Logique de filtrage côté client
│       ├── workshopHistory.ts       Helpers vue historique
│       └── query.ts                 Construction des query strings
├── Dockerfile
├── nginx.conf                       Configuration Nginx production
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 3. Stack technique et dépendances

### 3.1 Backend (`backend/package.json`)

**Runtime :** Node.js 20 (LTS)

| Dépendance | Version | Rôle |
|---|---|---|
| `express` | ^4.18.2 | Framework HTTP |
| `pg` | ^8.11.3 | Client PostgreSQL (node-postgres) |
| `zod` | ^3.22.4 | Validation des schémas d'entrée API |
| `jsonwebtoken` | ^9.0.2 | Génération et vérification JWT |
| `bcrypt` | ^6.0.0 | Hachage des mots de passe |
| `cookie-parser` | ^1.4.6 | Parsing des cookies signés |
| `cors` | ^2.8.5 | CORS (origin configurée par `CLIENT_ORIGIN`) |
| `dotenv` | ^16.3.1 | Chargement des variables d'environnement |

**DevDependencies notables :** `typescript@^5.3.3`, `ts-node`, `nodemon`, `jest@^30`, `ts-jest`

**Scripts npm :**
```
npm run dev        nodemon --watch src --ext ts --exec ts-node src/server.ts
npm run build      tsc  (compile vers dist/)
npm start          node dist/server.js
npm run migrate    ts-node src/db/migrate.ts  (migrations standalone)
npm test           jest
npm run test:coverage  jest --coverage
npm run seed:demo  script de données de démo
```

**TypeScript (`tsconfig.json`) :**
- `target: ES2020`, `module: commonjs`
- `strict: true`, `sourceMap: true`, `declaration: true`

### 3.2 Frontend (`frontend/package.json`)

**Runtime de build :** Node.js 20

| Dépendance | Version | Rôle |
|---|---|---|
| `react` | ^18.2.0 | Framework UI |
| `react-dom` | ^18.2.0 | Renderer DOM |
| `react-router-dom` | ^6.21.3 | Routing SPA |

**DevDependencies notables :** `vite@^8.0.13`, `@vitejs/plugin-react@^6.0.2`, `typescript@^5.3.3`, `vitest@^4.1.5`, `@testing-library/react@^16.3.2`

**Scripts npm :**
```
npm run dev        vite  (port 5173)
npm run build      tsc && vite build  (compile vers dist/)
npm run preview    vite preview
npm test           vitest run
npm run test:watch vitest
npm run test:coverage  vitest run --coverage
```

**TypeScript (`tsconfig.json`) :**
- `target: ES2020`, `module: ESNext`, `moduleResolution: bundler`
- `strict: true`, `jsx: react-jsx`, `noEmit: true`

**Vite (`vite.config.ts`) :**
- Plugin `@vitejs/plugin-react`
- Serveur dev : port 5173, `host: true`
- Tests (Vitest) : environnement `jsdom`, globals activés, setup `src/test/setup.ts`

---

## 4. Configuration et variables d'environnement

### 4.1 Backend (`.env.example`)

| Variable | Valeur de démo | Description |
|---|---|---|
| `PORT` | `3000` | Port d'écoute Express |
| `DATABASE_URL` | `postgres://sentinel:sentinel_password@localhost:5432/sentinel` | DSN PostgreSQL |
| `ADMIN_USERNAME` | `admin` | Identifiant du compte admin (créé au démarrage si absent) |
| `ADMIN_PASSWORD` | `change_me_in_production` | Mot de passe admin initial |
| `COOKIE_SECRET` | `change_me_in_production` | Secret de signature des cookies |
| `JWT_SECRET` | `change_me_in_production` | Secret de signature des JWT |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origine CORS autorisée (pas de slash final) |
| `NODE_ENV` | `development` | `production` active HTTPS cookies et les guards |
| `TRUST_PROXY` | *(absent)* | `true` ou valeur Express `trust proxy` (derrière Nginx/LB) |

### 4.2 Frontend (`.env.example`)

| Variable | Valeur de démo | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | URL de base de l'API backend |

### 4.3 Validation de la configuration de production

`src/config/production.ts` est appelé au démarrage (`assertProductionConfig()`). En mode `NODE_ENV=production`, il vérifie :
- Présence de toutes les variables requises (`DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `COOKIE_SECRET`, `JWT_SECRET`, `CLIENT_ORIGIN`)
- Que les secrets ont une longueur ≥ 24 caractères et ne sont pas dans la liste des valeurs par défaut faibles
- Que `CLIENT_ORIGIN` ne pointe pas sur `localhost`
- Que `DATABASE_URL` n'utilise pas le mot de passe de démo `sentinel_password`

**Le processus refuse de démarrer si ces conditions ne sont pas remplies.**

---

## 5. Infrastructure Docker

### 5.1 `docker-compose.yml`

Trois services :

| Service | Image / Build | Port exposé | Dépendance |
|---|---|---|---|
| `postgres` | `postgres:15-alpine` | *(interne)* | — |
| `backend` | `./backend/Dockerfile` | `3000:3000` | `postgres` (healthcheck) |
| `frontend` | `./frontend/Dockerfile` | `5173:80` | `backend` (healthcheck) |

Le volume `sentinel_data` persiste les données PostgreSQL.

**Healthchecks :**
- PostgreSQL : `pg_isready -U sentinel -d sentinel` (interval 5s, retries 10)
- Backend : `wget -qO- http://localhost:3000/api/health` (interval 10s, retries 5)

### 5.2 Dockerfile backend

Build multi-stage :
1. `builder` (node:20-alpine) : `npm ci` + `npm run build` (compile TypeScript → `dist/`)
2. `production` (node:20-alpine) : `npm ci --omit=dev` + copie `dist/` + copie `migrations/`

Commande de démarrage : `node dist/server.js` (qui exécute les migrations au boot).

### 5.3 Dockerfile frontend

Build multi-stage :
1. `builder` (node:20-alpine) : `npm ci` + `npm run build` — `VITE_API_URL` injecté comme `ARG`
2. `production` (nginx:alpine) : copie `dist/` vers `/usr/share/nginx/html` + `nginx.conf`

### 5.4 Configuration Nginx (`nginx.conf`)

- Écoute sur le port 80
- `try_files $uri $uri/ /index.html` → routing SPA React Router
- Assets statiques (js, css, images, fonts) : `Cache-Control: public, immutable` avec expiration 1 an
- Compression gzip activée (`text/plain`, `text/css`, `application/json`, `application/javascript`…)
- Headers de sécurité sur toutes les réponses (voir §8.5)

---

## 6. Base de données

### 6.1 Système de migrations

`src/db/migrate.ts` est exécuté à chaque démarrage du backend. Il :
1. Crée la table `schema_migrations (filename VARCHAR PRIMARY KEY, applied_at TIMESTAMPTZ)` si elle n'existe pas
2. Lit et trie les fichiers `.sql` dans `backend/migrations/`
3. Pour chaque fichier non encore appliqué : exécute dans une transaction, puis enregistre dans `schema_migrations`
4. En cas d'erreur SQL : rollback et arrêt

Le script peut aussi être exécuté de façon autonome : `npm run migrate`.

### 6.2 Liste des migrations

| # | Fichier | Contenu |
|---|---|---|
| 001 | `create_admin_accounts` | Table `admin_accounts` |
| 002 | `create_sentinel_users` | Table `sentinel_users` (badge, rôle, is_active, is_deleted) |
| 003 | `create_account_audit_events` | Table `account_audit_events` |
| 004 | `create_production_lines` | Table `production_lines` (machine_sequence JSONB) |
| 005 | `add_is_active_to_production_lines` | Colonne `is_active` sur les lignes |
| 006 | `add_user_password_hash` | Colonne `password_hash` (nullable) sur `sentinel_users` |
| 007 | `create_workshop_incidents` | Table `workshop_incidents` (champs de base) |
| 008 | `add_workshop_incident_actions` | Champs workflow : `is_taken`, `diagnostic`, `edit_request`… |
| 009 | `add_incident_workflow_fields` | Champs complémentaires : `responsible_comment`, `intervention_note`… |
| 010 | `add_delete_request_reason` | Colonne `delete_request_reason` (ancien nom de cancel) |
| 011 | `add_incident_assignment_fields` | Champs `taken_by_user_id`, `taken_at` |
| 012 | `create_workshop_incident_events` | Table `workshop_incident_events` (event_type, payload JSONB) |
| 013 | `add_incident_display_order` | Colonne `display_order BIGINT` |
| 014 | `create_line_audit_events` | Table `line_audit_events` |
| 015 | `harden_workshop_integrity` | Contraintes CHECK (rôle, shift, state, status), index de performance |
| 016 | `remove_other_incident_state` | Suppression de l'état `AUTRE` |
| 017 | `enforce_taken_consistency` | Contraintes `chk_taken_consistency`, `chk_pending_must_be_taken`, `chk_edit_request_shape` + index unique actif par emplacement machine |
| 018 | `create_workshop_incident_followers` | Table `workshop_incident_followers` (suivi logique) |
| 019 | `refine_incident_cancellation_and_watchers` | Colonnes `cancel_request`/`cancel_request_reason`, ajout statut `INVALIDATED`, FK RESTRICT sur followers |
| 020 | `add_workshop_password_setup_codes` | Colonnes `password_setup_token_hash`, `password_setup_expires_at` + contrainte `chk_password_setup_pair` |
| 021 | `harden_workshop_setup_invariants` | Renforcement des contraintes `chk_password_setup_pair` et `chk_edit_request_shape` |

### 6.3 Schéma complet

#### `admin_accounts`
```sql
id              SERIAL PRIMARY KEY
username        VARCHAR NOT NULL UNIQUE
password_hash   VARCHAR NOT NULL
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

#### `sentinel_users`
```sql
id                          SERIAL PRIMARY KEY
first_name                  VARCHAR NOT NULL
last_name                   VARCHAR NOT NULL
badge_number                VARCHAR NOT NULL
role                        VARCHAR NOT NULL  -- CHECK IN ('OPERATOR','MAINTENANCE','RESPONSABLE')
is_active                   BOOLEAN NOT NULL DEFAULT TRUE
is_deleted                  BOOLEAN NOT NULL DEFAULT FALSE
password_hash               VARCHAR           -- NULL jusqu'au premier login
password_setup_token_hash   VARCHAR           -- NULL une fois le mot de passe défini
password_setup_expires_at   TIMESTAMPTZ       -- NULL une fois le mot de passe défini
created_at                  TIMESTAMPTZ DEFAULT NOW()
updated_at                  TIMESTAMPTZ DEFAULT NOW()
deleted_at                  TIMESTAMPTZ

UNIQUE INDEX sur badge_number WHERE is_deleted = FALSE
CONSTRAINT chk_password_setup_pair :
  (password_setup_token_hash IS NULL AND password_setup_expires_at IS NULL)
  OR (password_hash IS NULL AND password_setup_token_hash IS NOT NULL AND password_setup_expires_at IS NOT NULL)
```

#### `production_lines`
```sql
id               SERIAL PRIMARY KEY
line_number      VARCHAR NOT NULL
machine_sequence JSONB NOT NULL DEFAULT '[]'
is_active        BOOLEAN NOT NULL DEFAULT TRUE
is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
created_at       TIMESTAMPTZ DEFAULT NOW()
updated_at       TIMESTAMPTZ DEFAULT NOW()
deleted_at       TIMESTAMPTZ

UNIQUE INDEX sur line_number WHERE is_deleted = FALSE
```

Structure d'un élément de `machine_sequence` :
```json
// Robot simple
{
  "machineId": "M01",
  "brand": "Fuji",
  "hasDoubleRobot": false,
  "robotNumber": "R1",
  "robotHeads": 8
}

// Double robot
{
  "machineId": "M02",
  "brand": "Panasonic",
  "hasDoubleRobot": true,
  "leftRobotNumber": "L1",
  "leftRobotHeads": 4,
  "rightRobotNumber": "R1",
  "rightRobotHeads": 4
}
```

#### `workshop_incidents`
```sql
id                    SERIAL PRIMARY KEY
user_id               INTEGER REFERENCES sentinel_users(id)
shift                 VARCHAR NOT NULL  -- CHECK IN ('MATIN','APRES_MIDI','NUIT','WEEKEND')
line_id               INTEGER NOT NULL
line_number           VARCHAR NOT NULL
machine_id            VARCHAR NOT NULL
machine_brand         VARCHAR NOT NULL
robot_label           VARCHAR NOT NULL
head_number           INTEGER NOT NULL  -- CHECK > 0
state                 VARCHAR NOT NULL  -- CHECK IN ('SKIPEE_PAR_MACHINE','SKIPEE_PAR_CONDUCTEUR','DEGRADEE','INDISPONIBLE')
comment               TEXT
current_product       TEXT
status                VARCHAR NOT NULL DEFAULT 'OPEN'  -- CHECK IN ('OPEN','PENDING','CLOSED','CANCELED','INVALIDATED')
is_taken              BOOLEAN NOT NULL DEFAULT FALSE
taken_by_user_id      INTEGER REFERENCES sentinel_users(id)
taken_at              TIMESTAMPTZ
is_priority           BOOLEAN NOT NULL DEFAULT FALSE
display_order         BIGINT NOT NULL DEFAULT 0
diagnostic            TEXT
intervention_note     TEXT
responsible_comment   TEXT
edit_request          JSONB
cancel_request        BOOLEAN NOT NULL DEFAULT FALSE
cancel_request_reason TEXT
delete_request        BOOLEAN NOT NULL DEFAULT FALSE    -- colonne legacy (alias cancel_request)
delete_request_reason TEXT                             -- colonne legacy
created_at            TIMESTAMPTZ DEFAULT NOW()
updated_at            TIMESTAMPTZ DEFAULT NOW()

CONSTRAINT chk_taken_consistency :
  (is_taken=false AND taken_by_user_id IS NULL AND taken_at IS NULL)
  OR (is_taken=true AND taken_by_user_id IS NOT NULL AND taken_at IS NOT NULL)

CONSTRAINT chk_pending_must_be_taken :
  status != 'PENDING' OR is_taken = true

CONSTRAINT chk_edit_request_shape :
  edit_request IS NULL OR (jsonb_typeof(edit_request)='object' AND edit_request contient au moins un champ connu)

UNIQUE INDEX idx_unique_active_incident_per_machine
  ON (line_id, machine_id, robot_label, head_number) WHERE status IN ('OPEN','PENDING')
```

#### `workshop_incident_followers`
```sql
id           SERIAL PRIMARY KEY
incident_id  INTEGER NOT NULL REFERENCES workshop_incidents(id) ON DELETE RESTRICT
user_id      INTEGER NOT NULL REFERENCES sentinel_users(id) ON DELETE RESTRICT
created_at   TIMESTAMPTZ DEFAULT NOW()
deleted_at   TIMESTAMPTZ   -- NULL = abonnement actif

UNIQUE INDEX sur (incident_id, user_id) WHERE deleted_at IS NULL
```

#### `workshop_incident_events`
```sql
id             SERIAL PRIMARY KEY
incident_id    INTEGER NOT NULL REFERENCES workshop_incidents(id)
actor_user_id  INTEGER NOT NULL REFERENCES sentinel_users(id)   -- jamais NULL
event_type     VARCHAR NOT NULL
payload        JSONB
created_at     TIMESTAMPTZ DEFAULT NOW()
```

#### `account_audit_events`
```sql
id              SERIAL PRIMARY KEY
target_user_id  INTEGER REFERENCES sentinel_users(id)
admin_id        INTEGER REFERENCES admin_accounts(id)
event_type      VARCHAR NOT NULL
changes         JSONB
created_at      TIMESTAMPTZ DEFAULT NOW()
```

#### `line_audit_events`
```sql
id              SERIAL PRIMARY KEY
target_line_id  INTEGER REFERENCES production_lines(id)
admin_id        INTEGER REFERENCES admin_accounts(id)
event_type      VARCHAR NOT NULL
changes         JSONB
created_at      TIMESTAMPTZ DEFAULT NOW()
```

---

## 7. Backend — Architecture

### 7.1 Point d'entrée (`server.ts`)

```
dotenv.config()
assertProductionConfig()           ← refuse de démarrer si config prod invalide
app.set('trust proxy', ...)        ← si TRUST_PROXY défini
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(securityHeaders)
app.use(express.json())
app.use(cookieParser(COOKIE_SECRET))

// Rate limiting appliqué AVANT le routing sur les endpoints de login
app.use('/api/auth/login',      loginRateLimit)
app.use('/api/board/session',  loginRateLimit)

// Routing
app.use('/api/admin/security',  adminSecurityRoutes)
app.use('/api/admin',           adminRoutes)         ← dashboard, quality, audit
app.use('/api/admin/accounts',  accountsRoutes)
app.use('/api/admin/lines',     linesRoutes)
app.use('/api/board',           boardRouter)
app.use('/api/workshop',        workshopRoutes)

app.get('/api/health', ...)        ← healthcheck public

// Démarrage
runMigrations()
seedAdminAccount()                 ← crée le compte admin si absent
app.listen(PORT)

// Shutdown gracieux sur SIGTERM / SIGINT
pool.end()
```

### 7.2 Pattern de couches par module

Chaque module suit la même organisation verticale :

```
module.routes.ts      Déclare les routes Express, applique les middlewares d'auth
module.controller.ts  Parse et valide les entrées (Zod), appelle le service, gère les erreurs HTTP
module.service.ts     Logique métier : vérifications, orchestration, transactions
module.repository.ts  Requêtes SQL (requêtes paramétrées uniquement)
module.validation.ts  Schémas Zod partagés entre contrôleur et service
module.events.ts      Fonctions de journalisation des événements d'audit
module.policy.ts      (workshop, lines) Règles de permission pures (pas d'I/O)
```

### 7.3 `ServiceResult<T>`

Pattern de retour uniforme du service vers le contrôleur :

```typescript
type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ErrorCode; message: string };

// Constructeurs helpers
ok(data)                          → { ok: true, data }
badRequest(message)               → { ok: false, status: 400, code: 'VALIDATION_ERROR', ... }
forbidden(message)                → { ok: false, status: 403, code: 'FORBIDDEN', ... }
notFound(message)                 → { ok: false, status: 404, code: 'NOT_FOUND', ... }
conflict(code, message)           → { ok: false, status: 409, code, ... }
```

Le contrôleur utilise `sendServiceError(res, result)` qui retourne `true` si une erreur a été envoyée, permettant un early return propre.

### 7.4 Transactions

`withTransaction<T>(fn)` acquiert un client du pool, ouvre une transaction BEGIN/COMMIT/ROLLBACK et passe le client à la fonction callback. Tous les couples (mutation + log d'audit) s'exécutent dans la même transaction.

```typescript
const result = await withTransaction(async (client) => {
  const account = await createAccountData(input, setupCodeHash, setupExpiresAt, client);
  await createAccountAuditEvent(account.id, adminId, 'USER_CREATED', changes, client);
  return account;
});
```

### 7.5 Utilitaires SQL (`db/sql.ts`)

| Fonction | Usage |
|---|---|
| `sqlStringList(values)` | Construit une liste SQL `'val1', 'val2'` (échappe les apostrophes) |
| `statusInSql(column, statuses)` | Génère `column IN ('OPEN', 'PENDING')` |
| `statusEqualsSql(column, status)` | Génère `column = 'OPEN'` |
| `statusNotEqualsSql(column, status)` | Génère `column != 'OPEN'` |
| `boundedInt(value, default, min, max)` | Parse un entier en le clampant entre min et max |
| `parseOptionalInt(value)` | Parse un entier facultatif, retourne null si invalide |

---

## 8. Backend — Authentification et sécurité

### 8.1 Sessions JWT

**Durée :** 8 heures (constante `SESSION_DURATION_HOURS = 8` dans `auth/session.ts`).

**Transport :** cookie HTTP-only uniquement. Jamais exposé dans les réponses JSON.

| Cookie | Nom | Scope |
|---|---|---|
| Admin | `sentinel_admin_token` | Toutes les routes `/api/admin/**` |
| Atelier | `sentinel_workshop_token` | Toutes les routes `/api/workshop/**` |

**Options cookie :**
```typescript
{
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',  // HTTPS uniquement en prod
  maxAge: 8 * 60 * 60 * 1000,                    // 8h en ms
}
```

**Payload JWT admin :**
```typescript
{ adminId: number; username: string }
```

**Payload JWT atelier :**
```typescript
{ userId: number; badgeNumber: string; role: string }
```

### 8.2 Middleware `adminAuthMiddleware`

1. Extrait le token du cookie `sentinel_admin_token`
2. Vérifie la signature JWT
3. **Requête DB de vérification** : confirme que `admin_accounts WHERE id = payload.adminId` existe toujours
4. Injecte `req.admin: AdminPayload` et appelle `next()`
5. En cas d'erreur JWT (expiré, invalide) : 401 `UNAUTHORIZED`
6. En cas d'erreur DB : 503 `SERVICE_UNAVAILABLE`

### 8.3 Middleware `workshopAuthMiddleware`

1. Extrait le token du cookie `sentinel_workshop_token`
2. Vérifie la signature JWT
3. **Requête DB de vérification** :
   ```sql
   SELECT id, badge_number, role FROM sentinel_users
   WHERE id = $1 AND badge_number = $2 AND is_active = TRUE
     AND is_deleted = FALSE AND password_hash IS NOT NULL
   ```
   - Vérifie que l'utilisateur est toujours actif
   - Vérifie que son badge n'a pas changé
   - **Vérifie que `password_hash IS NOT NULL`** — un utilisateur dont le mot de passe a été réinitialisé par l'admin perd automatiquement sa session
4. En cas d'utilisateur invalide : efface le cookie + 401
5. En cas d'erreur JWT : efface le cookie + 401

### 8.4 Hachage des mots de passe

| Type | Fonction | Rounds bcrypt |
|---|---|---|
| Mot de passe admin | `hashAdminPassword()` | 12 |
| Mot de passe atelier | `hashWorkshopPassword()` | 10 |
| Setup code | `hashWorkshopPasswordSetupCode()` | 10 (réutilise `hashWorkshopPassword`) |

**Longueur minimale :**
- Admin : 12 caractères (`MIN_PASSWORD_LENGTH_ADMIN`)
- Atelier : 6 caractères (`MIN_PASSWORD_LENGTH_WORKSHOP`)

### 8.5 Setup codes

Générés pour les nouveaux comptes et lors des réinitialisations. Implémentation dans `auth/setupCode.ts` :

- **Alphabet :** `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 caractères sans ambiguïté visuelle)
- **Longueur :** 10 caractères, soit ~50 bits d'entropie
- **Génération :** `crypto.randomBytes(10)`, chaque octet mappé via `byte % 32`
- **TTL :** 24 heures (`WORKSHOP_PASSWORD_SETUP_CODE_TTL_HOURS = 24`)
- **Normalisation :** espaces, tirets et casse ignorés à la vérification (`trim().replace(/[\s-]/g, '').toUpperCase()`)
- **Stockage :** hashé (bcrypt ×10) dans `password_setup_token_hash`, jamais en clair

Le code est retourné en clair **une seule fois** dans la réponse de création/réinitialisation, à communiquer à l'utilisateur.

### 8.6 Rate limiting login (`loginRateLimit.ts`)

- **Fenêtre :** 15 minutes
- **Seuil :** 20 tentatives par fenêtre
- **Clé d'identification :** `METHOD:path:IP:identité` (username ou badgeNumber normalisé)
- **Stockage :** Map en mémoire (pas de Redis — remise à zéro au redémarrage)
- **Nettoyage :** automatique à chaque requête si la dernière purge date de > 15 min
- **Réponse en cas de dépassement :** HTTP 429 + header `Retry-After`

### 8.7 Headers de sécurité (`securityHeaders.ts`)

Appliqués sur toutes les réponses backend :

| Header | Valeur |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production uniquement) |

### 8.8 Vérification du mot de passe admin pour actions sensibles

`POST /api/admin/security/verify-password` permet de confirmer le mot de passe admin avant une opération destructive (suppression d'utilisateur, suppression de ligne) sans rouvrir de session.

**Protection anti-bruteforce intégrée :** au bout de 3 échecs consécutifs (dans une fenêtre de 30 min), la session admin est invalidée et le cookie effacé.

---

## 9. Backend — Modules

### 9.1 Module `auth` et `adminSecurity`

**Routes auth unifiees :** `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`

**Routes sécurité admin :** `POST /api/admin/security/verify-password`, `PATCH /api/admin/security/password`

**`unifiedLoginService` :** cherche d'abord un admin par username, sinon un utilisateur workshop par badge, puis pose le cookie correspondant via le contrôleur auth unifié.

**`changePassword` :** vérifie le mot de passe actuel → hache le nouveau (bcrypt ×12, min 12 car.) → met à jour en DB → **efface le cookie** (l'admin doit se reconnecter).

**`verifyPassword` :** vérifie le mot de passe dans le contexte d'une session active. Compte les échecs en mémoire (Map `verifyFailures`), invalide la session après 3 échecs.

### 9.2 Module `admin`

**Routes :** `GET /dashboard`, `GET /quality`, `GET /audit`

**`getReferenceDashboard` :** retourne les compteurs globaux du référentiel (users total/actifs/inactifs/sans mot de passe, lines total/actives/inactives, machines total, événements récents).

**`getReferenceQuality` :** analyse la cohérence du référentiel en mémoire application depuis les données brutes :
- Utilisateurs sans mot de passe (compte créé mais setup non complété)
- Utilisateurs inactifs
- Lignes inactives
- Machines malformées (machineId ou brand vide, ou ligne active sans machine)
- Machines dupliquées (même machineId sur plusieurs lignes)

**`listReferenceAudit` :** joint `account_audit_events` et `line_audit_events` en un journal unifié. Filtres : `scope`, `taskGroup`, `q` (recherche texte), `start`/`end`, `order`, `limit` (1–250, défaut 100).

### 9.3 Module `accounts`

**Validation Zod :**
```typescript
createAccountSchema = {
  firstName: string (min 2)
  lastName:  string (min 2)
  badgeNumber: string (min 2, max 40)
  role: 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE'
}
updateAccountSchema = createAccountSchema.partial()
```

**`createAccountService` :**
1. Vérifie unicité du badge (`accountBadgeExists`)
2. Génère un setup code (`generateWorkshopPasswordSetupCode`)
3. Transaction : insère l'utilisateur (avec `password_setup_token_hash`) + événement audit `USER_CREATED`
4. Retourne le setup code en clair dans la réponse (unique occasion)

**`resetAccountPasswordService` :**
1. Génère un nouveau setup code
2. Transaction : `UPDATE sentinel_users SET password_hash = NULL, password_setup_token_hash = $2 ...` + audit `USER_PASSWORD_RESET`
3. L'utilisateur perd immédiatement sa session (le middleware vérifie `password_hash IS NOT NULL`)

**`deactivateAccountService` / `deleteAccountService` :**
Bloquées si `getActiveTakenIncidentCountForUser(id) > 0`.

**`updateAccountService` :**
Bloquée sur le changement de rôle si incidents actifs pris en charge.

**DTO public (`AccountDto`) :** ne contient jamais `password_hash` ni `password_setup_token_hash`. Expose uniquement `has_password` (booléen), `has_password_setup_code` (booléen), `password_setup_expires_at`.

### 9.4 Module `lines`

**Structure de validation Zod :** discriminated union `SingleRobotMachine | DoubleRobotMachine` dans `lines.validation.ts` pour chaque machine.

**`lines.policy.ts` :** vérifie les conflits d'identifiants machine entre lignes. Un identifiant machine doit être unique dans l'ensemble des lignes actives (hors la ligne en cours de modification).

**Types de modifications et événements d'audit :**
La détection du type de modification est faite en service (`lines.service.ts`) par comparaison des champs modifiés :
- Seuls `lineNumber` ou `isActive` → `LINE_SUMMARY_UPDATED`
- Seule une machine (même orde) → `LINE_MACHINE_UPDATED`
- Seul l'ordre des machines → `LINE_PLAN_UPDATED`
- Tout autre cas → `LINE_UPDATED`

### 9.5 Module `workshopCredentials`

**Flux de connexion (service) :**

```
loginWorkshopUserService(badgeNumber, password?, newPassword?, setupCode?)
  → findActiveWorkshopUserByBadge(badgeNumber)
     ├─ introuvable → { kind: 'invalid_badge' }
     ├─ password_hash IS NULL :
     │   ├─ pas de newPassword/setupCode → { kind: 'requires_password_setup' }
     │   ├─ setup code expiré → { kind: 'expired_setup_code' }
     │   ├─ setup code invalide → { kind: 'invalid_setup_code' }
     │   └─ valide → hashWorkshopPassword(newPassword) + setWorkshopUserPassword()
     │                → { kind: 'success' }
     └─ password_hash existant :
         ├─ pas de password → { kind: 'requires_password' }
         ├─ bcrypt invalide → { kind: 'invalid_password' }
         └─ valide → { kind: 'success' }
```

Ce service est interne au login unifié ; aucune route publique `/api/workshop/auth/*` n’est exposée.

### 9.6 Module `workshop`

C'est le module central du Workshop. Il couvre les incidents, les métriques, l'historique, le pilotage et la connaissance. Le board est exposé séparément par `/api/board`.

#### Validation Zod

**`createIncidentSchema` :**
```typescript
{
  shift: 'MATIN' | 'APRES_MIDI' | 'NUIT' | 'WEEKEND'
  lineId: number (positif)
  machineId: string
  robotLabel: string
  headNumber: number (min 1)
  state: 'SKIPEE_PAR_MACHINE' | 'SKIPEE_PAR_CONDUCTEUR' | 'DEGRADEE' | 'INDISPONIBLE'
  comment?: string (max 1000)
  currentProduct?: string (max 120)
}
```

**`updateIncidentSchema`** (partial de `createIncidentSchema` + champs workflow) :
```typescript
{
  // Champs descriptifs (partial)
  shift?, lineId?, machineId?, robotLabel?, headNumber?, state?, comment?, currentProduct?
  // Champs workflow
  isTaken?, isPriority?, displayOrder?, status?, diagnostic?, interventionNote?
  responsibleComment?, requestOnly?, cancelRequest?, cancelRequestReason?
  invalidationReason?, applyEditRequest?, rejectEditRequest?, rejectDeleteRequest?
  // Legacy
  deleteRequest?, deleteRequestReason?
}
```

#### Service — création d'incident

`createIncidentService` valide la sélection ligne/machine/robot/tête via `validateIncidentSelectionService` avant insertion. Cette fonction vérifie :
1. La ligne est active (`getActiveWorkshopLine`)
2. La machine existe dans `machine_sequence` de la ligne
3. Le robot (`label`) correspond au type de machine (simple/double)
4. Le `headNumber` est entre 1 et `robotHeads`

#### Service — mise à jour d'incident (`updateIncidentService`)

C'est la fonction la plus complexe du backend. Elle détermine l'action à effectuer à partir du payload, en contrôlant les permissions via `workshop.policy.ts` (`canPerform(role, action, incident, actorId)`), puis orchestre les mises à jour et les événements.

Tableau de dispatch des actions :

| Condition dans le payload | Action déterminée |
|---|---|
| `requestOnly: true` + champs descriptifs | `REQUEST_EDIT` |
| `cancelRequest: true` + `cancelRequestReason` | `REQUEST_CANCEL` |
| `applyEditRequest: true` | `APPROVE_EDIT` |
| `rejectEditRequest: true` (ou `rejectDeleteRequest`) | `REJECT_EDIT` |
| `cancelRequest: false` (rejet) | `REJECT_CANCEL` |
| `isTaken: true` | `TAKE` |
| `status: 'PENDING'` | `SET_PENDING` |
| `status: 'OPEN'` (depuis PENDING) | `RESUME` |
| `status: 'CLOSED'` | `CLOSE` |
| `status: 'INVALIDATED'` + `invalidationReason` | `INVALIDATE_CLOSED` |
| `isPriority` uniquement | `SET_PRIORITY` |
| `responsibleComment` uniquement | `RESPONSIBLE_COMMENT` |
| Champs descriptifs, incident pris par soi-même | `EDIT_AFTER_TAKE` |
| Champs descriptifs, incident non pris | `DIRECT_EDIT` |

#### Auto-suivi RESPONSABLE

`autoFollowForResponsable(incidentId, actorUserId, actorRole, client)` est appelé lors des actions `APPROVE_EDIT`, `REJECT_EDIT`, `APPROVE_CANCEL`, `REJECT_CANCEL`, et lors de la création. Si l'acteur est un RESPONSABLE, il est automatiquement abonné à l'incident via `followIncidentData`.

---

## 10. Frontend — Architecture

### 10.1 Routing (`App.tsx`)

```
/                         → redirect /login
/login                    LoginPage             (GuestRoute, portail 3 blocs)
/admin/login              AdminLoginPage        (GuestRoute)
/workshop/login           WorkshopLoginPage     (GuestRoute)
/admin                    → redirect /admin/accueil
/admin/accueil            AdminHomePage         (AdminRoute)
/admin/users              UserListPage          (AdminRoute)
/admin/users/:id          UserDetailPage        (AdminRoute)
/admin/lines              LinesPage             (AdminRoute)
/admin/audit              AdminAuditPage        (AdminRoute)
/board                    BoardAccessPage       (code board)
/workshop/dashboard       WorkshopDashboardPage (WorkshopRoute)
/workshop/pilotage        WorkshopPilotagePage  (WorkshopRoute)
/workshop/history         WorkshopHistoryPage   (WorkshopRoute)
/workshop/knowledge       WorkshopKnowledgePage (WorkshopRoute)
/workshop/support         WorkshopSupportPage   (WorkshopRoute)
*                         → redirect /login
```

### 10.2 Contextes d'authentification

**`AppAuthContext` :**
- État : session unifiée admin ou workshop, `loading: boolean`
- Initialisation : appel `GET /api/auth/me` au montage
- Expose : `setSession()`, `logout()`

**`AdminRoute` :** si session absente ou non admin → `<Navigate to="/login" />`

**`WorkshopRoute` :** si session absente ou non workshop → `<Navigate to="/login" />`

**`GuestRoute` :** redirige une session existante vers son espace.

### 10.3 Client API (`api/client.ts`)

Wrapper `fetch` centralisé :
- Base URL : `import.meta.env.VITE_API_URL` (injecté par Vite au build)
- `credentials: 'include'` sur toutes les requêtes (envoi des cookies HTTP-only)
- Gestion des erreurs : parse le JSON de la réponse d'erreur, lève une exception typée `ApiError`

### 10.4 Pages

| Page | Route | Description |
|---|---|---|
| `LoginPage` | `/login` | Portail 3 blocs Board / Administration / Workshop |
| `AdminLoginPage` | `/admin/login` | Connexion administration |
| `WorkshopLoginPage` | `/workshop/login` | Connexion atelier |
| `AdminHomePage` | `/admin/accueil` | Dashboard référentiel + indicateurs qualité |
| `UserListPage` | `/admin/users` | Liste des comptes atelier avec filtres |
| `UserDetailPage` | `/admin/users/:id` | Détail et actions sur un compte |
| `LinesPage` | `/admin/lines` | Liste et gestion des lignes de production |
| `AdminAuditPage` | `/admin/audit` | Journal d'audit référentiel |
| `BoardAccessPage` | `/board` | Acces board par code local |
| `WorkshopDashboardPage` | `/workshop/dashboard` | Dashboard incidents actifs |
| `WorkshopBoardPage` | `/board` apres code | Board grand ecran lecture seule |
| `WorkshopPilotagePage` | `/workshop/pilotage` | KPI et analytics |
| `WorkshopHistoryPage` | `/workshop/history` | Historique incidents et événements |
| `WorkshopKnowledgePage` | `/workshop/knowledge` | Base de connaissance |

---

## 11. Frontend — Types et contrats d'API

### 11.1 Types principaux (`types/index.ts`)

```typescript
type Role = 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE'
type IncidentShift = 'MATIN' | 'APRES_MIDI' | 'NUIT' | 'WEEKEND'
type IncidentState = 'SKIPEE_PAR_MACHINE' | 'SKIPEE_PAR_CONDUCTEUR' | 'DEGRADEE' | 'INDISPONIBLE'
type IncidentStatus = 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED'
```

**`WorkshopIncident` :** objet incident complet retourné par `GET /workshop/incidents`. Contient les champs de l'incident, les informations du déclarant (`first_name`, `last_name`, `badge_number`, `role`), les informations du technicien (`taken_by_first_name`, `taken_by_last_name`, `taken_by_role`), et les champs de suivi (`is_followed`, `followed_at`).

**`WorkshopBoardData` :** objet retourné par `GET /api/board/data` (route lecture seule protegee). Contient uniquement `lines`, `incidents` (format allégé `WorkshopBoardIncident`) et `metrics`.

**`WorkshopAnalytics` :** objet complet retourné par `GET /workshop/analytics`. Contient les KPI numériques, les délais médians/moyens, les classements (`by_state`, `by_line`, `by_machine`) et les données de tendance (`trend[]`).

**`ReferenceDashboard` :** compteurs du référentiel + liste `recent_events`.

**`ReferenceQuality` :** listes d'anomalies détectées (utilisateurs sans mot de passe, machines malformées, doublons…).

### 11.2 Format des réponses d'erreur API

```typescript
interface ApiError {
  error: {
    code: string;   // Ex: 'NOT_FOUND', 'VALIDATION_ERROR', 'FORBIDDEN'
    message: string;
  };
}
```

Codes d'erreur définis côté backend (`utils/errors.ts`) :
`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BADGE_ALREADY_EXISTS`, `LINE_ALREADY_EXISTS`, `MACHINE_ALREADY_EXISTS`, `RESOURCE_IN_USE`, `RATE_LIMITED`, `SERVER_ERROR`, `SERVICE_UNAVAILABLE`

---

## 12. Frontend — Gestion des permissions

`utils/workshopPermissions.ts` est le miroir exact de `backend/src/modules/workshop/workshop.policy.ts`. Les deux fichiers implémentent la même logique de `canPerform(role, action, incident, actorId?)` pour assurer la cohérence UI/API.

Actions disponibles côté frontend :
```typescript
type WorkshopAction =
  | 'requestEdit' | 'directEdit' | 'editAfterTake'
  | 'requestCancel' | 'cancel'
  | 'approveEdit' | 'rejectEdit'
  | 'approveCancel' | 'rejectCancel'
  | 'take' | 'setPending' | 'resume' | 'close'
  | 'setPriority' | 'reorder' | 'responsibleComment' | 'invalidateClosed'
```

Cette fonction est appelée dans les composants de carte d'incident pour afficher/masquer conditionnellement les boutons d'action.

**Important :** les permissions côté frontend sont purement cosmétiques (UX). Le backend revalide systématiquement chaque action dans `workshop.policy.ts` avant toute mutation.

---

## 13. Tests

### 13.1 Backend (Jest)

**Configuration :** `jest.config.js` dans `backend/`, utilise `ts-jest`.

**Localisation des tests :** `src/**/__tests__/*.test.ts`

Modules couverts : `config/`, `domain/`, `modules/accounts/`, `modules/lines/`, `modules/workshop/`, `modules/workshopCredentials/`, `utils/`.

**Commandes :**
```bash
npm test                 # jest
npm run test:coverage    # jest --coverage
```

### 13.2 Frontend (Vitest)

**Configuration :** dans `vite.config.ts`, section `test`.

- Environnement : `jsdom`
- Globals activés
- Setup : `src/test/setup.ts` (configuration `@testing-library/jest-dom`)
- Coverage : provider `v8`, inclut `src/utils/**`, `src/components/**`, `src/pages/**`

**Localisation des tests :** `src/**/__tests__/*.test.{ts,tsx}`

**Commandes :**
```bash
npm test                 # vitest run
npm run test:watch       # vitest (watch mode)
npm run test:coverage    # vitest run --coverage
```

---

## 14. Démarrage en développement

### 14.1 Prérequis

- Node.js 20+
- PostgreSQL 15+ (ou Docker)
- npm

### 14.2 Avec Docker Compose (recommandé)

```bash
# À la racine du projet (sentinel/)
cp backend/.env.example backend/.env       # configurer si besoin
docker compose up --build
```

Le backend applique les migrations automatiquement au démarrage.
Le compte admin est créé s'il n'existe pas (ADMIN_USERNAME / ADMIN_PASSWORD).

Accès :
- Frontend : http://localhost:5173
- Backend API : http://localhost:3000
- Portail : http://localhost:5173/login

### 14.3 En local sans Docker

**PostgreSQL :**
```bash
# Créer la base
createdb sentinel
```

**Backend :**
```bash
cd backend
cp .env.example .env        # éditer DATABASE_URL si besoin
npm install
npm run dev                  # nodemon + ts-node, port 3000
```

**Frontend :**
```bash
cd frontend
cp .env.example .env         # VITE_API_URL=http://localhost:3000
npm install
npm run dev                  # vite, port 5173
```

### 14.4 Migrations standalone

```bash
cd backend
npm run migrate
```

### 14.5 Données de démonstration

```bash
cd backend
npm run seed:demo            # scripts/seedWorkshopProductionDemo.js
```

---

## 15. Déploiement en production

### 15.1 Checklist des variables d'environnement

Le backend refuse de démarrer si l'une de ces conditions n'est pas remplie :

| Variable | Exigence |
|---|---|
| `DATABASE_URL` | Présent, ne doit pas contenir `sentinel_password` |
| `ADMIN_USERNAME` | Présent |
| `ADMIN_PASSWORD` | Présent, ≥ 24 caractères, pas dans la liste des valeurs faibles |
| `COOKIE_SECRET` | Présent, ≥ 24 caractères, pas dans la liste des valeurs faibles |
| `JWT_SECRET` | Présent, ≥ 24 caractères, pas dans la liste des valeurs faibles |
| `CLIENT_ORIGIN` | Présent, ne doit pas contenir `localhost` |

**Générer des secrets robustes :**
```bash
openssl rand -hex 32
```

**Activer TRUST_PROXY derrière un reverse proxy :**
```env
TRUST_PROXY=true
```

### 15.2 Build Docker Compose production

```bash
# Créer un fichier docker-compose.prod.yml ou utiliser des overrides
docker compose up --build -d
```

Les valeurs d'environnement peuvent être injectées via un fichier `.env` à la racine du projet ou via les variables d'environnement du système d'orchestration (Kubernetes secrets, etc.).

### 15.3 Considérations réseau

- Le frontend (Nginx, port 80) est le seul service exposé publiquement
- Le backend (port 3000) et PostgreSQL sont internes au réseau Docker
- CORS : `CLIENT_ORIGIN` doit correspondre exactement à l'URL publique du frontend (sans slash final)
- HTTPS : configurer le TLS au niveau du reverse proxy en amont de Nginx ; le header `Strict-Transport-Security` est activé automatiquement côté backend en `NODE_ENV=production`

### 15.4 Données

Le volume Docker `sentinel_data` persiste la base PostgreSQL. Prévoir une stratégie de sauvegarde (`pg_dump`) indépendante de Docker.

Les migrations sont idempotentes (table `schema_migrations`) : un redémarrage du backend n'applique que les migrations non encore exécutées.

---

*Documentation générée à partir du code source de Sentinel v1 — Juin 2026.*
