# Architecture de Sentinel

## Vue d'ensemble

Sentinel est une application web full-stack de gestion d'incidents d'atelier industriel.

```
┌─────────────────────────────────────────────────────┐
│                    NAVIGATEUR                        │
│           React 18 + TypeScript + Vite              │
└────────────────────────┬────────────────────────────┘
                         │ HTTP / JSON
                         │ JWT en cookie HTTP-only
┌────────────────────────▼────────────────────────────┐
│                    BACKEND                           │
│           Node.js + Express + TypeScript            │
└────────────────────────┬────────────────────────────┘
                         │ SQL paramétré
┌────────────────────────▼────────────────────────────┐
│                BASE DE DONNÉES                       │
│               PostgreSQL 15                         │
└─────────────────────────────────────────────────────┘
```

---

## Architecture backend : 4 couches

Chaque requête HTTP traverse exactement 4 couches dans cet ordre.
Chaque couche a une seule responsabilité et ne connaît que la couche en dessous.

```
Requête HTTP
     │
     ▼
┌─────────────┐
│   ROUTES    │  Déclare les URLs et les middlewares d'authentification.
│             │  Ne contient aucune logique.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ CONTROLLER  │  Valide l'input (Zod), appelle le service, renvoie la réponse HTTP.
│             │  Ne contient aucune logique métier.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   SERVICE   │  Contient toute la logique métier.
│             │  Vérifie les permissions, orchestre les opérations, logge les événements.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ REPOSITORY  │  Parle à la base de données uniquement.
│             │  Contient toutes les requêtes SQL. Ne contient aucune logique métier.
└─────────────┘
```

**Pourquoi ce découpage ?**
Si demain on veut changer de base de données, on ne touche qu'au repository.
Si on veut changer le protocole HTTP, on ne touche qu'aux routes et controllers.
La logique métier (les règles) reste isolée dans les services.

---

## Modules backend

```
backend/src/
├── server.ts                  # Point d'entrée, configuration Express
├── db/
│   ├── pool.ts                # Connexion PostgreSQL (pool de connexions)
│   ├── migrate.ts             # Runner de migrations
│   └── transaction.ts         # Helper withTransaction()
├── domain/
│   └── constants.ts           # Énumérations partagées (rôles, statuts, actions)
├── middlewares/
│   ├── adminAuth.ts           # Vérifie le JWT admin sur chaque requête admin
│   └── workshopAuth.ts        # Vérifie le JWT workshop sur chaque requête atelier
├── utils/
│   ├── errors.ts              # Type ErrorCode + fonction sendError()
│   ├── serviceResult.ts       # Type ServiceResult<T> + helpers
│   └── controller.ts          # Helpers partagés entre controllers
└── modules/
    ├── adminAuth/             # Login/logout admin
    ├── admin/                 # Dashboard admin
    ├── accounts/              # CRUD utilisateurs workshop
    ├── lines/                 # CRUD lignes de production
    └── workshop/              # Gestion des incidents (module principal)
        ├── workshop.routes.ts
        ├── workshop.controller.ts
        ├── workshop.service.ts     # Fonctions dédiées par action
        ├── workshop.repository.ts
        ├── workshop.policy.ts      # Matrice de permissions
        ├── workshop.events.ts      # Logging des événements d'audit
        └── workshop.validation.ts  # Schémas Zod
```

---

## Authentification

Sentinel a **deux systèmes d'authentification complètement séparés** avec des cookies distincts.

### Auth Admin
- Login par username + mot de passe
- Cookie HTTP-only nommé `sentinel_admin_session`
- JWT vérifié à chaque requête par `adminAuth` middleware
- Donne accès à : gestion des utilisateurs, lignes, audit

### Auth Workshop
- Login par numéro de badge + mot de passe (optionnel au premier login)
- Cookie HTTP-only nommé `sentinel_workshop_session`
- JWT vérifié à chaque requête par `workshopAuth` middleware
- À chaque requête : vérifie en base que l'utilisateur est toujours actif
- Donne accès à : tableau de bord incidents, historique, analytics

**Pourquoi deux systèmes séparés ?**
Un administrateur système et un opérateur d'atelier ont des périmètres d'action totalement différents. Les séparer garantit qu'un badge d'opérateur ne peut jamais donner accès aux fonctions d'administration.

---

## Système de permissions

Les actions possibles sur un incident sont contrôlées par un système de permissions à deux niveaux.

### Les 3 rôles workshop
| Rôle | Qui c'est | Ce qu'il fait |
|---|---|---|
| `OPERATOR` | Opérateur de ligne | Déclare les incidents, peut demander des corrections |
| `MAINTENANCE` | Technicien de maintenance | Prend en charge, diagnostique, clôture les incidents |
| `RESPONSABLE` | Responsable d'atelier | Supervise, approuve, priorise, analyse |

### Fonctionnement
1. **Backend** (`workshop.policy.ts`) : source de vérité. Chaque action est vérifiée avant d'exécuter la logique métier.
2. **Frontend** (`workshopPermissions.ts`) : miroir du backend pour désactiver les boutons côté UI. Ne remplace pas la vérification backend.

### Les 17 actions possibles
| Action | Qui peut faire | Condition |
|---|---|---|
| `REQUEST_EDIT` | OPERATOR | Incident actif |
| `REQUEST_CANCEL` | OPERATOR | Actif + non pris |
| `DIRECT_EDIT` | RESPONSABLE, MAINTENANCE | Actif + non pris |
| `EDIT_AFTER_TAKE` | MAINTENANCE | Actif + pris par lui-même |
| `CANCEL` | RESPONSABLE, MAINTENANCE | Actif + non pris |
| `APPROVE_EDIT` | RESPONSABLE | Demande d'édition en attente |
| `REJECT_EDIT` | RESPONSABLE | Demande d'édition en attente |
| `APPROVE_CANCEL` | RESPONSABLE | Demande d'annulation en attente |
| `REJECT_CANCEL` | RESPONSABLE | Demande d'annulation en attente |
| `TAKE` | MAINTENANCE | OPEN + non pris |
| `SET_PENDING` | MAINTENANCE | OPEN + pris |
| `RESUME` | MAINTENANCE | PENDING + pris |
| `CLOSE` | MAINTENANCE | OPEN + pris |
| `SET_PRIORITY` | RESPONSABLE | Incident actif |
| `REORDER` | RESPONSABLE | Incident actif |
| `RESPONSIBLE_COMMENT` | RESPONSABLE | Incident actif |
| `INVALIDATE_CLOSED` | RESPONSABLE | Incident CLOSED |

---

## Cycle de vie d'un incident

Voir [INCIDENT_LIFECYCLE.md](./INCIDENT_LIFECYCLE.md) pour le diagramme complet.

```
OPEN ──(TAKE)──► OPEN pris ──(SET_PENDING)──► PENDING
  │                   │                           │
  │               (CLOSE)                     (RESUME)
  │                   │                           │
  │                   ▼                           │
  │                CLOSED ◄───────────────────────┘
  │
  └──(CANCEL / APPROVE_CANCEL)──► CANCELED
  
CLOSED ──(INVALIDATE_CLOSED)──► INVALIDATED
```

---

## Base de données

### Choix technique : PostgreSQL + SQL brut
**Pas d'ORM** (pas de Prisma, pas de TypeORM).

**Pourquoi ?**
- Les données de Sentinel sont relationnelles : incidents liés à des lignes, des machines, des utilisateurs.
- Le SQL brut donne un contrôle total sur les requêtes, en particulier pour les requêtes analytiques complexes (pilotage).
- Les requêtes sont paramétrées (`$1, $2, ...`) ce qui élimine le risque d'injection SQL.
- Pour un projet de cette taille, un ORM aurait ajouté une couche de complexité sans bénéfice mesurable.

### Schéma principal (tables clés)
```
sentinel_users          # Utilisateurs workshop (OPERATOR, MAINTENANCE, RESPONSABLE)
production_lines        # Lignes de production avec leurs machines (JSON)
workshop_incidents      # Table principale des incidents
workshop_incident_events # Log immuable de tous les événements (audit trail)
workshop_incident_followers # Suivi d'incidents par le RESPONSABLE
account_audit_events    # Journal des modifications d'utilisateurs
line_audit_events       # Journal des modifications de lignes
admin_accounts          # Compte administrateur (unique)
```

### Stratégie de migrations
- Fichiers SQL numérotés séquentiellement (`001_`, `002_`, ...)
- Chaque migration est appliquée une seule fois et enregistrée dans `schema_migrations`
- Migrations unidirectionnelles (pas de rollback) — choix assumé pour ce projet

---

## Pattern ServiceResult

Toutes les fonctions de service retournent un type `ServiceResult<T>`.

```typescript
type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ErrorCode; message: string }
```

**Pourquoi ?**
- Pas d'exceptions pour les erreurs métier (NOT_FOUND, FORBIDDEN, etc.)
- Le controller sait toujours comment répondre : `if (sendServiceError(res, result)) return`
- Les erreurs sont typées — impossible d'utiliser un code d'erreur qui n'existe pas

---

## Audit trail

Chaque action sur un incident génère un événement dans `workshop_incident_events`.

```typescript
type IncidentEventType =
  | 'INCIDENT_CREATED' | 'INCIDENT_TAKEN' | 'INCIDENT_SET_PENDING'
  | 'INCIDENT_RESUMED' | 'INCIDENT_CLOSED' | 'INCIDENT_CANCELED'
  | 'INCIDENT_INVALIDATED' | 'EDIT_REQUESTED' | 'EDIT_APPLIED'
  | 'EDIT_REJECTED' | 'CANCEL_REQUESTED' | 'CANCEL_REQUEST_REJECTED'
  | 'PRIORITY_CHANGED' | 'RESPONSIBLE_COMMENT_UPDATED' | ...
```

Chaque événement contient : qui a fait quoi, quand, et un payload JSON avec les détails (valeurs avant/après, raisons, etc.).

---

## Frontend

### Structure
```
frontend/src/
├── App.tsx              # Routing principal (React Router 6)
├── api/                 # Fonctions d'appel API (une par module)
├── components/          # Composants réutilisables (modales, UI kit)
├── pages/               # Pages complètes
├── types/               # Types TypeScript (interfaces des données)
└── utils/               # Utilitaires (permissions, labels, dates, filtres)
```

### Espaces séparés
- **Espace Admin** (`/admin/...`) : protégé par `AdminAuthContext`
- **Espace Workshop** (`/workshop/...`) : protégé par `WorkshopAuthContext`
- **Board public** (`/workshop/board`) : accessible sans authentification

### Communication avec le backend
- `fetch` natif avec cookies inclus automatiquement (`credentials: 'include'`)
- Pas de bibliothèque HTTP externe (pas d'Axios)
- Chaque module API est dans un fichier dédié (`api/workshop.ts`, `api/accounts.ts`, etc.)

---

## Infrastructure

### Docker
```yaml
postgres   # PostgreSQL 15 avec health check
backend    # Node.js compilé, attend que postgres soit healthy
frontend   # Build Vite statique servi par nginx, attend que backend soit healthy
```

### CI/CD (GitHub Actions)
- Déclenché sur chaque push et pull request vers `main`
- **Backend** : build TypeScript → tests Jest → verify:reliability
- **Frontend** : build Vite → tests Vitest

---

## Décisions techniques assumées

| Décision | Alternative | Pourquoi ce choix |
|---|---|---|
| Raw SQL | ORM (Prisma) | Contrôle total, pas de magie, requêtes analytiques complexes |
| JWT en cookie HTTP-only | localStorage | Protégé contre XSS, standard de sécurité |
| Deux systèmes d'auth | Un seul JWT avec rôle admin | Périmètres complètement séparés, plus sûr |
| Pas de WebSocket | Polling HTTP | Suffisant pour les besoins, moins de complexité |
| Pas de cache Redis | Cache en mémoire | Pas nécessaire à ce stade, ajout possible en v2 |
| Fetch natif | Axios | Pas de dépendance supplémentaire pour ce besoin |
