# Documentation technique Sentinel

**État documenté :** 17 juillet 2026
**Architecture :** SPA React + API Express + PostgreSQL + Docker Compose

Cette référence décrit le code du dépôt. Les procédures d'exploitation sont
séparées dans [deploiement-vps.md](deploiement-vps.md) et
[runbook.md](runbook.md).

## 1. Topologie

```text
Navigateur
  |
  | HTTPS, JSON, cookies HTTP-only
  v
Caddy
  |-- /api/* ----------> backend Express :3000
  +-- autres chemins --> frontend Nginx :8080
                              |
backend ----------------------+
  |
  +--> PostgreSQL :5432
  +--> SMTP (optionnel)
  +--> API DeepSeek (optionnelle)
```

Les trois espaces Board, Administration et Atelier sont des routes de la même
SPA. Ils utilisent trois audiences JWT distinctes et des projections API
différentes.

## 2. Arborescence

```text
sentinel/
  .github/
    workflows/ci.yml         pipeline de qualité
    dependabot.yml           mises à jour automatisées
  backend/
    migrations/              001 à 046, SQL append-only
    scripts/                 seeds et audit structurel
    src/
      auth/                  JWT, cookies, bcrypt et payloads
      config/                validation de production
      db/                    pool, migrations, bootstrap
      domain/                constantes et types métier
      middlewares/           auth, headers, rate limits
      modules/               modules fonctionnels
      scripts/               commandes opératoires compilées
      utils/                 erreurs et résultats communs
  frontend/
    e2e/                     tests Playwright
    src/
      api/                   client HTTP et endpoints
      components/            UI réutilisable
      hooks/                 orchestration asynchrone
      pages/                 écrans applicatifs
      routes/                contextes et gardes
      styles/                styles globaux et par page
      types/                 contrats TypeScript
      utils/                 règles miroir et transformations
  scripts/                   backup et restauration
  Caddyfile
  docker-compose.yml
```

## 3. Runtimes et dépendances

### Backend

- Node.js 24 ;
- TypeScript strict ;
- Express 4 ;
- `pg` sans ORM ;
- Zod pour les entrées ;
- bcrypt pour les secrets vérifiables ;
- jsonwebtoken pour les sessions ;
- Pino pour les logs ;
- Nodemailer pour SMTP ;
- Jest/ts-jest pour les tests.

### Frontend

- React 18 ;
- React Router 6 ;
- Vite 8 ;
- TypeScript strict ;
- Vitest + Testing Library ;
- Playwright pour le navigateur réel.

Les versions exactes sont verrouillées dans les `package-lock.json`. `npm ci`
est utilisé en CI, dans les images et dans les procédures reproductibles.

## 4. Configuration

### 4.1 Backend

| Variable | Production | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | active cookies sécurisés et validation stricte |
| `PORT` | `3000` | port interne API |
| `BUILD_SHA` | requise | SHA Git complet exposé par `/api/health` |
| `DATABASE_URL` | requise | URL PostgreSQL interne |
| `COOKIE_SECRET` | requise | secret cookies, 24 caractères minimum |
| `JWT_SECRET` | requise | secret JWT, 24 caractères minimum |
| `CLIENT_ORIGIN` | requise | origine HTTPS exacte sans chemin |
| `TRUST_PROXY` | requise | confiance accordée au proxy inverse retenu |
| `BOARD_ACCESS_CODE_HASH` | requise | hash bcrypt du code Board |
| `ADMIN_USERNAME` | bootstrap | premier admin sur base vide |
| `ADMIN_PASSWORD` | bootstrap | mot de passe initial fort |
| `LOG_LEVEL` | optionnelle | niveau Pino, défaut `info` |
| `GLOBAL_API_RATE_LIMIT_MAX` | optionnelle | quota global par fenêtre |
| `SUPPORT_API_TIMEOUT_MS` | optionnelle | timeout du fournisseur IA |
| `DEEPSEEK_API_KEY` | optionnelle | active le support IA |
| `SMTP_*`, `ADMIN_EMAIL` | optionnelles | active les notifications mail |
| `NOTIFICATION_*` | optionnelles | cadence, lot et retries de l'outbox |

`assertProductionConfig()` refuse :

- les variables requises absentes ;
- les secrets trop courts, identiques ou contenant encore un placeholder ;
- une origine non HTTPS, locale, factice, avec credentials, chemin, query ou fragment ;
- une URL PostgreSQL incomplète, d'un autre protocole ou avec un mot de passe faible ;
- un hash Board qui ne respecte pas le format bcrypt ;
- un `BUILD_SHA` absent ou différent d'un SHA Git complet ;
- les quotas, timeouts et paramètres d'outbox hors des bornes documentées.

Les variables admin ne sont plus requises après l'amorçage si un admin existe
déjà. Une base de production vide sans ces variables refuse de démarrer.

### 4.2 Frontend

| Variable | Valeur | Description |
| --- | --- | --- |
| `VITE_API_URL` | vide en production | API same-origin `/api` |
| `VITE_API_TIMEOUT_MS` | `15000` | timeout par défaut du client |

En développement, `VITE_API_URL=http://localhost:3000`. La fonction de client
normalise le préfixe et ne duplique pas `/api`.

## 5. Démarrage backend

Ordre de `server.ts` :

1. charge `.env` ;
2. valide la configuration si `NODE_ENV=production` ;
3. installe middlewares et routes ;
4. exécute `runMigrations()` ;
5. exécute `seedAdminAccount()` ;
6. ouvre le serveur HTTP ;
7. démarre le worker de notifications.

Un SIGTERM/SIGINT déclenche un arrêt idempotent : le worker cesse de réserver de
nouveaux messages, le serveur refuse de nouvelles connexions, les connexions
restantes disposent d'un délai, puis le pool PostgreSQL est fermé.

## 6. Migrations

### 6.1 Ledger

Le runner crée/complète `schema_migrations(filename, checksum, applied_at)`. Il
travaille avec un seul `PoolClient` et un advisory lock de session.

Pour chaque démarrage :

1. liste et trie les fichiers `NNN_*.sql` ;
2. calcule le SHA-256 de leur contenu ;
3. normalise l'alias historique de la migration 038 ;
4. vérifie que chaque ligne du ledger possède encore son fichier ;
5. refuse tout checksum divergent ;
6. applique chaque migration manquante dans une transaction ;
7. enregistre le checksum avant de libérer le lock.

Conséquence : un fichier publié ne se modifie jamais. Toute évolution est une
nouvelle migration.

### 6.2 Évolution du schéma

Le dépôt comprend 46 migrations :

- 001-006 : admin, utilisateurs, audit initial, lignes et mots de passe ;
- 007-019 : incidents, workflow, événements, intégrité et followers ;
- 020-029 : setup, versions de session, anonymisation et snapshots ;
- 030-037 : reset, e-mails, notifications, paramètres et audit système ;
- 038-040 : consultation historique puis machine à états d'arbitrage ;
- 041 : admin singleton et bornes runtime ;
- 042-043 : projection normalisée et validation des machines ;
- 044 : normalisation/unicité des badges actifs ;
- 045 : outbox durable ;
- 046 : namespaces des identifiants opérationnels.

### 6.3 Modèle principal

#### Identités

- `admin_accounts` : admin unique, bcrypt, e-mail, préférences, paramètres et
  versions de session/Board ;
- `sentinel_users` : identité atelier, rôle, activation, anonymisation, bcrypt,
  setup et version de session ;
- `password_reset_requests` : demandes bornées et statut de traitement.

#### Référentiel

- `production_lines` : numéro, ordre JSON des machines, activation/archivage ;
- `production_line_machines` : projection synchronisée par trigger, position,
  identifiant normalisé et payload. Elle impose l'unicité globale des IDs machine.

Le JSON reste le write model ordonné attendu par l'API ; la projection SQL ferme
les courses que des contrôles applicatifs seuls ne pourraient pas empêcher.

#### Incidents

- `workshop_incidents` : état courant, affectation, demande en cours, snapshots ;
- `workshop_incident_events` : journal append-only applicatif ;
- `workshop_incident_followers` : suivis explicites par utilisateur ;
- `workshop_arbitration_cases` : demande, état de consultation et décision.

#### Audit et asynchrone

- `account_audit_events`, `line_audit_events`, `admin_system_audit_events` ;
- `notification_outbox` : payload mail, statut, tentatives et prochaine tentative.

## 7. Accès aux données

Les repositories utilisent des placeholders PostgreSQL. Les fragments dynamiques
restants proviennent exclusivement de listes/colonnes contrôlées par le code
(ordre whitelisté, clauses construites et constantes échappées).

Les mutations à risque suivent le patron :

```text
BEGIN
  SELECT ... FOR UPDATE
  vérifier acteur, état et absence de conflit
  UPDATE/INSERT conditionnel
  écrire événement et outbox
COMMIT
```

Les violations concurrentes (`23505`, `23503`, `23514`) sont reconnues par des
helpers et traduites en résultats métier sans exposer le SQL.

Les mutations d'incident qui dépendent du référentiel appliquent un ordre de
verrouillage unique : lignes par identifiant croissant, utilisateur lorsque
l'action en dépend, puis incident. Une lecture préparatoire non verrouillante peut
uniquement servir à découvrir les identifiants à verrouiller. Dans la transaction,
le service :

1. verrouille chaque ligne active avec le même `PoolClient` ;
2. verrouille ensuite l'incident ;
3. revalide `line_id` et la version MVCC `xmin` contre la lecture préparatoire ;
4. valide machine, robot et tête depuis le JSON de la ligne verrouillée ;
5. écrit l'incident, son événement et ses effets associés avant le `COMMIT`.

La création suit le même principe sans lecture préparatoire : transaction ouverte,
ligne active verrouillée, sélection validée, puis insertion. Si l'incident a changé
pendant la préparation d'une édition ou d'un arbitrage, l'API répond `409 CONFLICT`
et n'applique aucun effet sur un état obsolète.

Les mutations du référentiel verrouillent elles aussi la ligne avant de recompter
ses incidents `OPEN` ou `PENDING`. Si ce compteur est non nul, le numéro, toute
modification de `machine_sequence` et la désactivation répondent
`409 RESOURCE_IN_USE` avant les recherches de conflits, l'écriture ou l'audit.
Une fois tous les incidents terminés, ces mutations redeviennent possibles sans
modifier les snapshots `line_number`, machine, robot et tête déjà portés par les
incidents historiques.

La prise en charge n'a pas de dépendance ligne : elle verrouille donc l'utilisateur,
revalide sous verrou son activation, sa non-suppression et son rôle Maintenance,
puis verrouille l'incident. Désactivation, suppression et changement de rôle
verrouillent le même utilisateur avant de recompter ses affectations actives. Selon
l'opération qui obtient le verrou en premier, la prise en charge est refusée ou la
mutation administrative répond `409 RESOURCE_IN_USE` ; aucun état intermédiaire ne
peut associer un incident actif à un technicien devenu inéligible.

Les éditions directes sans écart réel sont court-circuitées avant toute écriture,
journalisation ou création implicite de suivi. Pour une demande de correction,
le service compare sous verrou les sept champs éditables, ne conserve que les
écarts et répond `400 NO_CHANGES` si la demande est identique. Un commentaire vide
et un commentaire `NULL` sont équivalents pour cette comparaison.

## 8. Authentification

### 8.1 Entrée unifiée

`POST /api/auth/login` détermine le type de compte à partir de l'entrée validée,
vérifie bcrypt et émet le cookie de l'audience correspondante. Chaque cookie est
HTTP-only, signé par `COOKIE_SECRET` et contient un JWT signé séparément par
`JWT_SECRET`. Les guards lisent uniquement `signedCookies` ; une valeur altérée
est refusée puis effacée. Les anciennes API de login séparées ont été supprimées.

`GET /api/auth/me` retourne la session valide et `POST /api/auth/logout` efface
les cookies de session. Les espaces `/api/auth`, `/api/admin`, `/api/workshop` et
`/api/board` répondent avec `Cache-Control: no-store`, y compris en erreur.

Le namespace est disjoint par construction : les badges Atelier contiennent
uniquement des chiffres, tandis que l'identifiant Admin ne peut pas être
uniquement numérique. Le même contrat s'applique au formulaire, à Zod et aux
contraintes PostgreSQL. Les numéros de ligne sont également numériques ; les
zéros initiaux restent significatifs.

### 8.2 Payloads

```ts
type AuthScope = 'admin' | 'workshop' | 'board';
```

- admin : `adminId`, `username`, `sessionVersion` ;
- workshop : `userId`, `badgeNumber`, `role`, `sessionVersion` ;
- board : `label`, `boardSessionVersion`.

Chaque guard valide le shape runtime, l'issuer, l'audience, l'algorithme et la
version courante en base.

Les actions Admin sensibles partagent un compteur de réauthentification. Les
quatre premiers échecs répondent `REAUTHENTICATION_FAILED` sans fermer la
session ; le cinquième incrémente la version de session, efface le cookie et
répond `SESSION_REVOKED`. Le frontend branche son comportement sur ces codes,
jamais sur le texte du message.

### 8.3 Mots de passe et codes

- mots de passe Admin/Atelier : bcrypt avec politiques distinctes ;
- code Board : bcrypt et comparaison constante fournie par la bibliothèque ;
- setup/reset : token aléatoire remis une fois, condensat seulement en base ;
- premier accès : consommation atomique par `UPDATE` conditionnel sur le hash,
  l'expiration et l'absence de mot de passe ; seule la ligne retournée peut ouvrir
  une session ;
- changement de badge ou de rôle, activation/désactivation, suppression et
  réinitialisation du mot de passe : incrément atomique de `session_version`.

## 9. Autorisation Atelier

La policy `workshop.policy.ts` reçoit rôle, action, incident courant et acteur.
Elle traite notamment :

- propriété de la déclaration pour les demandes opérateur ;
- prise ou transfert explicite par maintenance ;
- édition après prise réservée au technicien affecté ;
- arbitrage réservé au responsable ;
- annulation superviseur d'un incident en attente ;
- priorité et consigne responsable ;
- invalidation d'une clôture.

Le miroir frontend améliore l'UX mais toute mutation appelle la policy backend
après verrouillage de l'incident.

## 10. API

### Authentification

| Méthode | Route | Usage |
| --- | --- | --- |
| POST | `/api/auth/login` | connexion unifiée |
| GET | `/api/auth/me` | session courante |
| POST | `/api/auth/logout` | déconnexion |
| POST | `/api/auth/password-reset/request` | demande atelier limitée |

### Administration

- `/api/admin/accounts` : liste, création, détail, impact, modification,
  activation, désactivation, reset et suppression ;
- `/api/admin/lines` : disponibilité, conflits, CRUD logique et archivage ;
- `/api/admin/security` : réauthentification, mot de passe et e-mail ;
- `/api/admin/settings` : notifications, Board et paramètres applicatifs ;
- `/api/admin/dashboard`, `/quality`, `/audit` : synthèses et traces ;
- `/api/admin/password-reset-requests` : file de traitement ;
- `/api/admin/support/chat` : support IA côté admin.

Toutes ces routes exigent une session admin, y compris les lectures sensibles.

### Atelier

Lectures :

- `/api/workshop/lines` ;
- `/api/workshop/incidents` et `/incidents/:id/events` ;
- `/api/workshop/history/incidents`, `/history/events` ;
- `/api/workshop/knowledge/incidents` ;
- `/api/workshop/metrics`, `/analytics`.

Mutations :

- création d'incident ;
- `PATCH /incidents/:id` avec action validée ;
- annulation contrôlée ;
- follow/unfollow ;
- consultation explicite d'arbitrage.

### Board

| Méthode | Route | Protection |
| --- | --- | --- |
| POST | `/api/board/session` | rate limit + code bcrypt |
| GET | `/api/board/me` | cookie Board |
| GET | `/api/board/data` | cookie Board ou Atelier, projection lecture seule |
| POST | `/api/board/logout` | effacement du cookie |

Le Board ne réutilise pas les endpoints détaillés Atelier.

## 11. Notifications

L'envoi direct au milieu d'une transaction est interdit. Les services déposent
un message durable avec une clé de déduplication. Le worker réserve par lot,
envoie, marque `COMPLETED` ou programme une nouvelle tentative.

Les templates :

- échappent noms, motifs, détails, identifiants et URLs ;
- séparent sujet texte et HTML ;
- passent par un layout commun ;
- sont couverts contre l'injection HTML.

Sans SMTP, l'application reste fonctionnelle et journalise la dégradation.

## 12. Support IA

Le backend est l'unique intermédiaire avec le fournisseur : la clé n'atteint
jamais le navigateur. Les entrées sont validées et bornées, la route est limitée
par identité/IP, la requête externe possède un timeout et la taille/schéma de la
réponse sont contrôlés.

La base de connaissance fonctionnelle est chargée depuis
`backend/docs/support-knowledge.md`, copiée dans l'image de production.

## 13. Frontend

### 13.1 Routing

Les pages sont chargées avec `React.lazy`. Les contextes vérifient la session
unifiée puis les gardes appliquent l'audience et, pour le responsable, le rôle.

Routes majeures :

- portail `/login`, logins dédiés `/admin/login` et `/workshop/login` ;
- Board `/board` ;
- admin `/admin/*` ;
- atelier `/workshop/dashboard`, `pilotage`, `history`, `journal`, `knowledge`,
  `support`.

### 13.2 Client HTTP

Le client `api/client.ts` :

- construit l'URL same-origin ou depuis `VITE_API_URL` ;
- envoie les cookies avec `credentials: include` ;
- combine un timeout interne et un `AbortSignal` appelant ;
- parse JSON uniquement lorsque le type de contenu le permet ;
- transforme les erreurs API en `ApiError` typée ;
- distingue timeout, annulation, réseau et erreur métier.

### 13.3 Données

Les hooks utilisent un identifiant de requête ou un contrôleur d'annulation pour
empêcher les réponses obsolètes. Le dashboard charge liste et métriques comme un
snapshot cohérent, ne poll que lorsque la page est visible et recharge au focus.

Les actions incident appliquent un mutex côté UI, propagent l'erreur métier et
mettent à jour simultanément liste et incident sélectionné.

### 13.4 Modales

Le portail de modale central :

- rend une seule couche par action ;
- verrouille le scroll du document ;
- rend l'application sous-jacente inerte ;
- piège le focus et le restaure ;
- ferme uniquement la couche supérieure avec Escape ;
- ouvre un `alertdialog` séparé pour un formulaire sale.

Les modales d'arbitrage sont denses, sans scroll interne sur les viewports
couverts, et permettent la décision directe. Reporter ne modifie pas l'état de
consultation ; Consulter le dossier est la seule action qui le fait.

### 13.5 Sécurité de rendu

Le rendu Markdown du support n'utilise pas de HTML brut. Les tokens sont échappés
et convertis vers des composants React. Aucun `dangerouslySetInnerHTML`, `eval`
ou secret applicatif n'est utilisé dans le frontend.

## 14. Tests

### Backend

- Jest unitaire avec mocks de repositories ;
- tests des policies, validations, transactions, erreurs et workers ;
- suites d'intégration contre PostgreSQL réel pour auth, comptes, lignes et
  cycle Atelier ;
- seuils de couverture globaux sur le périmètre métier critique ;
- `verifyReliability.js` pour les invariants transverses backend/frontend.

### Frontend

- Vitest + jsdom pour composants, hooks, API et utilitaires ;
- Testing Library pour les interactions et l'accessibilité de base ;
- seuils de couverture élevés sur client, hooks, permissions, analytics et
  parsing Markdown ;
- Playwright pour l'édition de machines et l'arbitrage mobile réel.

### CI

| Job | Contrat |
| --- | --- |
| Backend | format, lint, scripts TypeScript, build, couverture, fiabilité, audit npm |
| Frontend | format, lint, build, couverture, audit npm |
| Integration | PostgreSQL 15 réel et migrations complètes |
| E2E | Chromium, fixtures dédiées et diagnostics sur échec |
| Containers | Compose, builds, utilisateurs non-root, Nginx, Caddy, ShellCheck |

Les jobs ont des timeouts, la concurrence annule les runs obsolètes et les droits
GitHub sont limités à `contents: read`.

## 15. Conteneurs

| Service | Image/runtime | Port interne | Exposition |
| --- | --- | --- | --- |
| `postgres` | PostgreSQL 15.18 Alpine | 5432 | aucune |
| `backend` | Node 24.18.0 Alpine, user `node` | 3000 | aucune |
| `frontend` | Nginx 1.30.4 Alpine, user `nginx` | 8080 | aucune |
| `caddy` | Caddy 2.11.4 Alpine | 80/443 | 80/443 |

Backend et frontend sont read-only, sans capabilities, avec `/tmp` temporaire.
Les healthchecks ordonnent le démarrage. Les logs utilisent le driver `json-file`
avec rotation.

Nginx écrit pid et caches temporaires dans `/tmp`, sert les assets avec cache long
et `index.html` sans cache afin de préserver les déploiements SPA.

## 16. Backup et reprise

`scripts/backup.sh` travaille via `docker compose exec -T postgres`, jamais via
un nom de conteneur. Il vérifie le dump avant publication et crée son checksum.

`scripts/restore.sh` importe dans une base temporaire, contrôle les tables
structurantes, arrête brièvement le backend puis échange les noms de base. Un trap
nettoie la base temporaire et tente le retour arrière si la bascule est incomplète.

## 17. Limites connues et extensions

- Sentinel est un monolithe mono-instance dans le Compose fourni ; l'outbox et le
  verrou de migration tolèrent plusieurs workers, mais un déploiement horizontal
  demanderait une stratégie explicite de sessions, santé et orchestration ;
- les migrations sont forward-only ; le rollback de schéma passe par une
  migration corrective ou une restauration ;
- l'observabilité repose sur logs et healthcheck, sans stack métrique fournie ;
- SMTP et DeepSeek sont des intégrations optionnelles à superviser séparément ;
- l'outbox déduplique la source et livre au moins une fois ; un crash entre
  l'acceptation SMTP et l'acquittement local peut donc déclencher un nouvel envoi ;
- les tests de charge et audits de navigateur assistés restent des campagnes de
  recette, pas des preuves permanentes de la CI standard.
