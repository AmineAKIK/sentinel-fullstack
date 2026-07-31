# Technique Sentinel

Référence du code du dépôt : architecture, configuration, sécurité applicative
et modèle de données. Les procédures d'exploitation et de déploiement sont
séparées dans [production.md](production.md).

## 1. Vue d'ensemble

Sentinel est un monolithe modulaire TypeScript, séparé en une SPA React, une
API Express et une base PostgreSQL. Le système privilégie des contrats
explicites, des transactions courtes et des contraintes SQL qui doublent les
règles métier critiques.

```text
Navigateur
  |
  | HTTPS, JSON, cookies HTTP-only
  v
Reverse proxy (Caddy ou Nginx hôte selon la topologie — voir production.md)
  |-- /api/* ----------> backend Express :3000
  +-- autres chemins --> frontend Nginx :8080
                              |
backend ----------------------+
  |-- authentification et rate limiting
  |-- controllers HTTP
  |-- services métier et politiques de rôle
  |-- repositories SQL paramétré
  |-- worker d'outbox
  v
PostgreSQL :5432
  +--> SMTP (optionnel)
  +--> API DeepSeek (optionnelle)
```

Trois audiences utilisent la même origine mais des sessions séparées :

- `admin` : administration du référentiel et de la sécurité ;
- `workshop` : utilisateurs atelier `OPERATOR`, `MAINTENANCE`, `RESPONSABLE` ;
- `board` : lecture seule du tableau grand écran. Une session Atelier valide
  peut aussi lire cette projection, sans réciprocité.

Board, Administration et Atelier sont trois espaces routés dans la même SPA,
avec trois audiences JWT distinctes et des projections API différentes.

## 2. Arborescence

```text
sentinel/
  .github/
    workflows/ci.yml         pipeline de qualité
    workflows/release.yml    publication et attestations
    dependabot.yml           mises à jour automatisées
  backend/
    migrations/              001 à 050, SQL append-only
    scripts/                 seeds et audit structurel
    src/
      auth/                  JWT, cookies, bcrypt et payloads
      config/                validation de production
      db/                    pool, migrations, bootstrap
      domain/                constantes et types métier
      middlewares/           auth, headers, rate limits
      modules/                modules fonctionnels
      scripts/                commandes opératoires compilées
      utils/                  erreurs et résultats communs
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
  security/                  politique d'exceptions de dépendances
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
- React Router 7.18.2 en Declarative Mode ;
- Vite 8 ;
- TypeScript strict ;
- Vitest + Testing Library ;
- Playwright pour le navigateur réel.

Les versions exactes sont verrouillées dans les `package-lock.json`. `npm ci`
est utilisé en CI, dans les images et dans les procédures reproductibles.

## 4. Backend

### 4.1 Point d'entrée

`backend/src/server.ts` :

1. charge `.env` ;
2. valide la configuration de production si `NODE_ENV=production` ;
3. installe CORS, logs structurés, headers de sécurité, limite JSON et
   cookies ;
4. applique le rate limiting global et celui des connexions ;
5. monte les routeurs du plus spécifique au plus générique ;
6. exécute `runMigrations()` sous verrou PostgreSQL ;
7. exécute `seedAdminAccount()` si la base est vide ;
8. démarre HTTP et le worker d'outbox.

Un SIGTERM/SIGINT déclenche un arrêt idempotent : le worker cesse de réserver
de nouveaux messages, le serveur refuse de nouvelles connexions, les
connexions restantes disposent d'un délai, puis le pool PostgreSQL est fermé.

La route `/api/health` vérifie une requête réelle vers PostgreSQL, publie le
SHA Git complet embarqué dans l'image et répond 503 si la base n'est pas
joignable.

### 4.2 Couches d'un module

Le chemin nominal est :

```text
route -> middleware -> controller -> service/policy -> repository -> PostgreSQL
```

- **route** : méthode, URL, ordre des middlewares ;
- **controller** : parsing HTTP, validation Zod, code de réponse ;
- **service** : transaction, invariants, orchestration et résultat métier ;
- **policy** : autorisation actor-aware fondée sur rôle et état ;
- **repository** : requêtes SQL paramétrées et mapping des lignes.

Les services retournent `ServiceResult<T>` pour distinguer les issues métier
attendues des exceptions techniques. Les contraintes uniques/foreign
keys/checks restent la dernière ligne de défense contre les courses
concurrentes.

### 4.3 Modules

| Module | Responsabilité |
| --- | --- |
| `auth` | connexion unifiée, session courante et déconnexion |
| `adminSecurity` | mot de passe, e-mail et réauthentification admin |
| `adminSettings` | paramètres runtime bornés et Board |
| `accounts` | comptes atelier, activation, rôle, archivage et audit |
| `lines` | lignes, machines normalisées, activation et archivage |
| `workshop` | incidents, arbitrage, historique, connaissance et analytics |
| `workshopCredentials` | setup et rotation du mot de passe atelier |
| `board` | code bcrypt, session dédiée et projection lecture seule |
| `passwordReset` | demandes et jetons de réinitialisation |
| `notifications` | outbox, modèles HTML échappés et SMTP |
| `support` | proxy IA borné, validé et limité en débit |
| `adminAudit` / `admin` | audit consolidé, dashboard et qualité référentiel |

## 5. Configuration

### 5.1 Backend

| Variable | Production | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | active cookies sécurisés et validation stricte |
| `PORT` | `3000` | port interne API |
| `BUILD_SHA` | requise | SHA Git complet exposé par `/api/health` |
| `DATABASE_URL` | requise | URL PostgreSQL interne |
| `COOKIE_SECRET` | requise | secret cookies, 24 caractères minimum |
| `JWT_SECRET` | requise | secret JWT, 24 caractères minimum |
| `CLIENT_ORIGIN` | requise | origine HTTPS canonique exacte, sans slash final |
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

`assertProductionConfig()` (`backend/src/config/production.ts`) refuse au
démarrage :

- les variables requises absentes ;
- les secrets trop courts (< 24 caractères), identiques entre eux, ou
  contenant encore un marqueur de placeholder (`change_me`, `replace_with`,
  `votre_`, `your_`) ;
- une origine non canonique, non HTTPS, locale, factice, avec credentials,
  wildcard, chemin, query, fragment, port par défaut explicite ou slash
  final ;
- une URL PostgreSQL incomplète, d'un autre protocole ou avec un mot de passe
  faible ;
- un hash Board qui ne respecte pas le format bcrypt (`$2a$/$2b$/$2y$`) ;
- un `BUILD_SHA` absent ou différent d'un SHA Git complet (40 caractères
  hexadécimaux) ;
- les quotas, timeouts et paramètres d'outbox hors des bornes documentées.

Les variables admin ne sont plus requises après l'amorçage si un admin
existe déjà. Une base de production vide sans ces variables refuse de
démarrer. SMTP et le support IA restent des dégradations douces : leur
absence produit un avertissement au démarrage, pas un arrêt.

`parseClientOrigin()` constitue l'unique contrat pour la validation de
configuration, le préflight, CORS et CSRF. La comparaison des requêtes porte
sur le schéma, l'hôte et le port effectif exacts. HTTP n'est accepté que pour
`localhost`, `127.0.0.1` ou `[::1]` en développement/test.

### 5.2 Frontend

| Variable | Valeur | Description |
| --- | --- | --- |
| `VITE_API_URL` | vide en production | API same-origin `/api` |
| `VITE_API_TIMEOUT_MS` | `15000` | timeout par défaut du client |

En développement, `VITE_API_URL=http://localhost:3000`. La fonction de client
normalise le préfixe et ne duplique pas `/api`.

## 6. Authentification et sécurité

### 6.1 Entrée unifiée

`POST /api/auth/login` détermine le type de compte à partir de l'entrée
validée, vérifie bcrypt et émet le cookie de l'audience correspondante.
Chaque cookie est HTTP-only, signé par `COOKIE_SECRET` et contient un JWT
signé séparément par `JWT_SECRET`. Les guards lisent uniquement
`signedCookies` ; une valeur altérée est refusée puis effacée. Les anciennes
API de login séparées ont été supprimées.

`GET /api/auth/me` retourne la session valide et `POST /api/auth/logout`
efface les cookies de session. Les espaces `/api/auth`, `/api/admin`,
`/api/workshop` et `/api/board` répondent avec `Cache-Control: no-store`, y
compris en erreur.

Le namespace est disjoint par construction : les badges Atelier contiennent
uniquement des chiffres, tandis que l'identifiant Admin ne peut pas être
uniquement numérique. Le même contrat s'applique au formulaire, à Zod et aux
contraintes PostgreSQL.

### 6.2 JWT cloisonnés et payloads

```ts
type AuthScope = 'admin' | 'workshop' | 'board';
```

Chaque JWT :

- est signé en `HS256` avec un secret obligatoire ;
- porte l'issuer `sentinel` ;
- porte une audience et un champ `scope` identiques (`admin`, `workshop` ou
  `board`) ;
- est vérifié avec une liste d'algorithmes fermée ;
- contient une version de session comparée à la base.

Contenu par audience :

- admin : `adminId`, `username`, `sessionVersion` ;
- workshop : `userId`, `badgeNumber`, `role`, `sessionVersion` ;
- board : `label`, `boardSessionVersion`.

Un token Board ne peut donc pas être accepté comme token Atelier ou Admin.
Les cookies sont HTTP-only, `sameSite=strict` et `secure` en production.

### 6.3 Révalidation serveur

Le middleware Atelier relit l'utilisateur à chaque requête sensible :
existence, activation, suppression, mot de passe, rôle et
`session_version`. Une suspension, un changement de rôle ou une rotation de
mot de passe prend effet sans attendre l'expiration du JWT.

L'admin suit la même logique avec son identifiant et sa version de session.
La base impose un seul enregistrement dans `admin_accounts` grâce à une clé
singleton.

Les actions Admin sensibles partagent un compteur de réauthentification. Les
quatre premiers échecs répondent `REAUTHENTICATION_FAILED` sans fermer la
session ; le cinquième incrémente la version de session, efface le cookie et
répond `SESSION_REVOKED`. Le frontend branche son comportement sur ces codes,
jamais sur le texte du message.

### 6.4 Mots de passe et codes

- mots de passe Admin/Atelier : bcrypt avec politiques distinctes ;
- code Board : bcrypt et comparaison constante fournie par la bibliothèque ;
- setup/reset : token aléatoire remis une fois, condensat seulement en base ;
- premier accès : consommation atomique par `UPDATE` conditionnel sur le
  hash, l'expiration et l'absence de mot de passe ; seule la ligne retournée
  peut ouvrir une session ;
- changement de badge ou de rôle, activation/désactivation, suppression et
  réinitialisation du mot de passe : incrément atomique de
  `session_version`.

### 6.5 Défenses HTTP

- CORS limité à `CLIENT_ORIGIN` ;
- headers de sécurité applicatifs ;
- corps JSON limité à 50 Ko ;
- limite globale par IP et limite renforcée sur les connexions ;
- logs avec cookies et Authorization masqués ;
- timeout, taille de réponse, schéma Zod et rate limit sur le support IA ;
- messages d'erreur publics séparés des détails techniques.

## 7. Domaine Atelier

### 7.1 Rôles et autorisation

- `OPERATOR` déclare et suit les incidents de production ;
- `MAINTENANCE` prend en charge, suspend, reprend et clôture selon les
  règles ;
- `RESPONSABLE` priorise, arbitre, suit et pilote.

La policy `workshop.policy.ts` reçoit rôle, action, incident courant et
acteur ; la fonction `canPerform` est la source d'autorité. Elle traite
notamment : propriété de la déclaration pour les demandes opérateur, prise ou
transfert explicite par maintenance, édition après prise réservée au
technicien affecté, arbitrage réservé au responsable, annulation superviseur
d'un incident en attente, priorité et consigne responsable, invalidation
d'une clôture. Le miroir frontend améliore l'UX mais toute mutation appelle
la policy backend après verrouillage de l'incident — le frontend ne remplace
jamais le contrôle serveur.

### 7.2 Cycle principal

```text
OPEN non pris -> OPEN pris -> PENDING -> OPEN pris -> CLOSED
      |              |           |             |
      +--------------+-----------+-------------+-> CANCELED
CLOSED -> INVALIDATED
```

Une prise en charge est une revendication ou un transfert explicite. Les
champs `is_taken`, `taken_by_user_id` et `taken_at` sont cohérents par
contrainte SQL. Une seule anomalie active peut exister pour un emplacement
machine donné. Voir [conception.md](conception.md) pour le détail complet des
transitions et invariants métier.

### 7.3 Arbitrage

Une demande de correction ou d'annulation crée un
`workshop_arbitration_cases` :

- `ACTIVE` : décision requise, compte dans la pastille de notification ;
- `CONSULTED` : le responsable a choisi explicitement « Consulter le
  dossier » ;
- `APPROVED` / `REJECTED` : décision finale ;
- `WITHDRAWN` / `SUPERSEDED` : demande retirée ou rendue caduque.

« Reporter » ferme la modale sans consulter le cas : il reste `ACTIVE`, la
pastille reste visible et la modale réapparaît à la prochaine ouverture.
Ouvrir le dossier pour une autre raison ne marque jamais l'arbitrage comme
consulté. Toutes les transitions de cas et d'incident sont effectuées dans la
même transaction et verrouillent les lignes concernées.

### 7.4 Traces et snapshots

Les événements d'incident conservent l'action, l'horodatage, les
changements, l'acteur explicite (utilisateur atelier, admin ou système) et
des snapshots de nom, badge, rôle et ligne nécessaires à l'historique. La
suppression/anonymisation d'un compte ne détruit donc pas le sens des traces
historiques. Les annulations et invalidations sont conservées mais exclues
des métriques opérationnelles actives.

## 8. Données et migrations

### 8.1 Tables structurantes

| Groupe | Tables principales |
| --- | --- |
| Identités | `admin_accounts`, `sentinel_users`, `password_reset_requests` |
| Référentiel | `production_lines`, `production_line_machines` |
| Incidents | `workshop_incidents`, `workshop_incident_events`, `workshop_incident_followers` |
| Arbitrage | `workshop_arbitration_cases` |
| Audit | `account_audit_events`, `line_audit_events`, `admin_system_audit_events` |
| Asynchrone | `notification_outbox` |

`workshop_arbitration_consultations` est une table de transition historique,
utilisée uniquement pour le backfill de la migration 040 ; le runtime courant
utilise les cas d'arbitrage.

### 8.2 Runner de migrations

`backend/src/db/migrate.ts` :

1. ouvre un client PostgreSQL unique et prend un advisory lock pour
   sérialiser les démarrages ;
2. liste et trie les fichiers `NNN_*.sql` ;
3. calcule un SHA-256 de chaque fichier et le stocke dans
   `schema_migrations` ;
4. normalise l'ancien alias de nom de la migration 038 ;
5. refuse la modification ou la disparition d'une migration appliquée ;
6. applique chaque nouvelle migration dans sa transaction, puis enregistre
   son checksum avant de libérer le lock.

Les migrations sont immuables après publication : toute évolution de schéma
est une nouvelle migration.

### 8.3 Évolution du schéma (50 migrations)

- 001-006 : admin, utilisateurs, audit initial, lignes et mots de passe ;
- 007-019 : incidents, workflow, événements, intégrité et followers ;
- 020-029 : setup, versions de session, anonymisation et snapshots ;
- 030-037 : reset, e-mails, notifications, paramètres et audit système ;
- 038-040 : consultation historique puis machine à états d'arbitrage ;
- 041 : admin singleton et bornes runtime ;
- 042-043 : projection normalisée et validation des machines ;
- 044 : normalisation/unicité des badges actifs ;
- 045 : outbox durable ;
- 046 : namespaces des identifiants opérationnels ;
- 047 : états terminaux observables de l'outbox ;
- 048 : destinataires déjà livrés pour la reprise idempotente de l'outbox ;
- 049 : durée Board `0`, sans expiration automatique mais toujours
  révocable ;
- 050 : motif de mise en attente séparé du diagnostic.

### 8.4 Modèle principal

**Identités.** `admin_accounts` (admin unique, bcrypt, e-mail, préférences,
versions de session/Board) ; `sentinel_users` (identité atelier, rôle,
activation, anonymisation, bcrypt, setup et version de session) ;
`password_reset_requests` (demandes bornées et statut de traitement).

**Référentiel.** `production_lines` (numéro, ordre JSON des machines,
activation/archivage) ; `production_line_machines` (projection synchronisée
par trigger, position, identifiant normalisé et payload, unicité globale des
IDs machine). Le JSON reste le write model ordonné attendu par l'API ; la
projection SQL ferme les courses que des contrôles applicatifs seuls ne
pourraient pas empêcher.

**Incidents.** `workshop_incidents` (état courant, affectation, demande en
cours, snapshots) ; `workshop_incident_events` (journal append-only
applicatif) ; `workshop_incident_followers` (suivis explicites par
utilisateur) ; `workshop_arbitration_cases` (demande, état de consultation et
décision).

**Audit et asynchrone.** `account_audit_events`, `line_audit_events`,
`admin_system_audit_events` ; `notification_outbox` (payload mail, statut,
tentatives et prochaine tentative).

### 8.5 Intégrité récente (migrations 039-045)

Renforcent notamment : les acteurs et snapshots d'audit, la machine à états
d'arbitrage, l'unicité de l'admin et les bornes des paramètres, la
normalisation des machines de ligne, la validation SQL des payloads de
machine, l'unicité insensible à la casse des badges actifs, l'outbox durable
de notifications.

## 9. Accès aux données

Les repositories utilisent des placeholders PostgreSQL. Les fragments
dynamiques restants proviennent exclusivement de listes/colonnes contrôlées
par le code (ordre whitelisté, clauses construites et constantes échappées).

Les mutations à risque suivent le patron :

```text
BEGIN
  SELECT ... FOR UPDATE
  vérifier acteur, état et absence de conflit
  UPDATE/INSERT conditionnel
  écrire événement et outbox
COMMIT
```

Les violations concurrentes (`23505`, `23503`, `23514`) sont reconnues par
des helpers et traduites en résultats métier sans exposer le SQL.

### 9.1 Ordre de verrouillage des mutations incident

Les mutations d'incident qui dépendent du référentiel appliquent un ordre de
verrouillage unique : lignes par identifiant croissant, utilisateur lorsque
l'action en dépend, puis incident. Une lecture préparatoire non verrouillante
peut uniquement servir à découvrir les identifiants à verrouiller. Dans la
transaction, le service :

1. verrouille chaque ligne active avec le même `PoolClient` ;
2. verrouille ensuite l'incident ;
3. revalide `line_id` et la version MVCC `xmin` contre la lecture
   préparatoire ;
4. valide machine, robot et tête depuis le JSON de la ligne verrouillée ;
5. écrit l'incident, son événement et ses effets associés avant le `COMMIT`.

La création suit le même principe sans lecture préparatoire. Si l'incident a
changé pendant la préparation d'une édition ou d'un arbitrage, l'API répond
`409 CONFLICT` et n'applique aucun effet sur un état obsolète.

Les mutations du référentiel verrouillent elles aussi la ligne avant de
recompter ses incidents `OPEN` ou `PENDING`. Si ce compteur est non nul, le
numéro, toute modification de `machine_sequence` et la désactivation
répondent `409 RESOURCE_IN_USE` avant les recherches de conflits, l'écriture
ou l'audit.

La prise en charge n'a pas de dépendance ligne : elle verrouille donc
l'utilisateur, revalide sous verrou son activation, sa non-suppression et son
rôle Maintenance, puis verrouille l'incident. Désactivation, suppression et
changement de rôle verrouillent le même utilisateur avant de recompter ses
affectations actives. Selon l'opération qui obtient le verrou en premier, la
prise en charge est refusée ou la mutation administrative répond
`409 RESOURCE_IN_USE` ; aucun état intermédiaire ne peut associer un incident
actif à un technicien devenu inéligible.

Les éditions directes sans écart réel sont court-circuitées avant toute
écriture, journalisation ou création implicite de suivi : le service compare
sous verrou les champs éditables et répond `400 NO_CHANGES` si la demande est
identique.

## 10. Notifications asynchrones

Les transactions métier insèrent un message dans `notification_outbox` au
lieu d'envoyer l'e-mail avant leur commit. L'envoi direct au milieu d'une
transaction est interdit. Le worker :

1. réserve un lot avec verrouillage compatible multi-worker ;
2. tente l'envoi SMTP ;
3. marque le message envoyé ou planifie un retry avec backoff ;
4. abandonne après `NOTIFICATION_MAX_ATTEMPTS` en conservant la trace.

Les templates échappent noms, motifs, détails, identifiants et URLs,
séparent sujet texte et HTML, et passent par un layout commun. Sans SMTP,
l'application reste fonctionnelle et journalise la dégradation.

La garantie est **au moins une tentative** : la clé source empêche de créer
deux éléments d'outbox pour le même événement, mais un arrêt brutal après
acceptation par le fournisseur SMTP et avant le passage local à `COMPLETED`
peut provoquer un nouvel envoi. L'outbox déduplique la source et livre au
moins une fois, par destinataire : chaque canal de notification
(`delivered_recipients`, migration 048) mémorise les adresses déjà confirmées
et les exclut des tentatives suivantes ; un crash entre l'acceptation SMTP
d'une adresse précise et l'acquittement local de cette même adresse peut donc
encore déclencher un renvoi à cette adresse précise, mais jamais aux adresses
déjà confirmées d'un même item ou d'un canal frère du même événement. C'est
une limite explicite des effets externes non transactionnels, à surveiller
côté exploitation.

## 11. Support IA

Le backend est l'unique intermédiaire avec le fournisseur : la clé n'atteint
jamais le navigateur. Les entrées sont validées et bornées, la route est
limitée par identité/IP, la requête externe possède un timeout et la
taille/schéma de la réponse sont contrôlés. La base de connaissance
fonctionnelle est chargée depuis `backend/docs/support-knowledge.md`, copiée
dans l'image de production.

## 12. API

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

Toutes ces routes exigent une session admin, y compris les lectures
sensibles.

### Atelier

Lectures : `/api/workshop/lines` ; `/api/workshop/incidents` et
`/incidents/:id/events` ; `/api/workshop/history/incidents`,
`/history/events` ; `/api/workshop/knowledge/incidents` ;
`/api/workshop/metrics`, `/analytics`.

Mutations : création d'incident ; `PATCH /incidents/:id` avec action
validée ; annulation contrôlée ; follow/unfollow ; consultation explicite
d'arbitrage.

### Board

| Méthode | Route | Protection |
| --- | --- | --- |
| POST | `/api/board/session` | rate limit + code bcrypt |
| GET | `/api/board/me` | cookie Board |
| GET | `/api/board/data` | cookie Board ou Atelier, projection lecture seule |
| POST | `/api/board/logout` | effacement du cookie |

Le Board ne réutilise pas les endpoints détaillés Atelier.

## 13. Frontend

### 13.1 Organisation et routing

- `api/` : client fetch typé, timeout et signaux d'annulation ;
- `hooks/` : chargements atomiques, polling visible et mutations ;
- `components/` : cartes, dossiers, filtres, modales et navigation ;
- `pages/` : espaces fonctionnels ;
- `routes/` : contexte de session et gardes par audience/rôle ;
- `utils/` : permissions miroir, analytics, tri et markdown sûr.

Les pages sont chargées avec `React.lazy`. Les contextes vérifient la
session unifiée puis les gardes appliquent l'audience et, pour le
responsable, le rôle. En production, l'API est same-origin ; en
développement, `VITE_API_URL` pointe vers le backend local.

### 13.2 Client HTTP

Le client `api/client.ts` construit l'URL same-origin ou depuis
`VITE_API_URL`, envoie les cookies avec `credentials: include`, combine un
timeout interne et un `AbortSignal` appelant, parse JSON uniquement lorsque
le type de contenu le permet, transforme les erreurs API en `ApiError`
typée, et distingue timeout, annulation, réseau et erreur métier.

### 13.3 Cohérence asynchrone

- un chargement périmé ne peut pas écraser un résultat plus récent
  (identifiant de requête ou contrôleur d'annulation) ;
- les requêtes sont annulées au démontage ou au changement de filtre ;
- le polling s'arrête lorsque l'onglet est masqué et reprend au focus ;
- les mutations ont un verrou UI contre le double clic ;
- l'incident sélectionné est mis à jour atomiquement avec la liste.

### 13.4 Modales et responsive

Le composant `Modal` est rendu dans un portail unique et gère :

- verrouillage du body et arrière-plan `inert` ;
- pile de modales, Escape uniquement sur la couche supérieure ;
- piège de focus et restauration du déclencheur ;
- confirmation séparée des changements non enregistrés (`alertdialog`) ;
- densité et actions bornées sur mobile sans débordement horizontal.

Le dossier incident adopte un panneau desktop et une navigation mobile qui
place le dossier en haut de la fenêtre. Les modales d'arbitrage sont denses,
sans scroll interne sur les viewports couverts, et permettent la décision
directe. Reporter ne modifie pas l'état de consultation ; Consulter le
dossier est la seule action qui le fait. Les arbitrages mobiles sont
couverts par Playwright sur un viewport 393 x 851.

### 13.5 Sécurité de rendu

Le rendu Markdown du support n'utilise pas de HTML brut. Les tokens sont
échappés et convertis vers des composants React. Aucun
`dangerouslySetInnerHTML`, `eval` ou secret applicatif n'est utilisé dans le
frontend.

## 14. Tests

### Backend

- Jest unitaire avec mocks de repositories ;
- tests des policies, validations, transactions, erreurs et workers ;
- suites d'intégration contre PostgreSQL réel pour auth, comptes, lignes et
  cycle Atelier ;
- seuils de couverture globaux sur le périmètre métier critique (80 %
  statements, 75 % branches, 70 % fonctions, 85 % lignes) ;
- `verifyReliability.js` pour les invariants transverses backend/frontend.

### Frontend

- Vitest + jsdom pour composants, hooks, API et utilitaires ;
- Testing Library pour les interactions et l'accessibilité de base ;
- seuils de couverture élevés sur client, hooks, permissions, analytics et
  parsing Markdown (85 % statements, 80 % branches, 90 % fonctions, 90 %
  lignes) ;
- Playwright pour l'édition de machines et l'arbitrage mobile réel.

### CI — six contrats indépendants

| Job | Contrat |
| --- | --- |
| `Backend / Quality` | format, lint, scripts TypeScript, build, couverture, fiabilité, audit npm |
| `Frontend / Quality` | format, lint, build, couverture, audit npm |
| `Backend / PostgreSQL integration` | PostgreSQL 15 réel et migrations complètes |
| `Browser / Critical journeys` | Chromium, fixtures dédiées et diagnostics sur échec |
| `Containers / Production contract` | Compose, builds, utilisateurs non-root, Nginx, Caddy, ShellCheck |
| `Ops / Backup and restore drill` | exercice sauvegarde/restauration isolé contre un PostgreSQL réel |

Les jobs ont des timeouts, la concurrence annule les runs obsolètes et les
droits GitHub sont limités à `contents: read`, étendus explicitement par job
selon le besoin réel. Dependabot surveille npm, Docker et GitHub Actions
chaque semaine.

## 15. Conteneurs

| Service | Image/runtime | Port interne | Exposition |
| --- | --- | --- | --- |
| `postgres` | PostgreSQL 15.18 Alpine | 5432 | aucune |
| `backend` | Node 24.18.0 Alpine, user `node` | 3000 | aucune |
| `frontend` | Nginx 1.30.4 Alpine, user `nginx` | 8080 | aucune |
| `caddy` | Caddy 2.11.4 Alpine (topologie autonome uniquement) | 80/443 | 80/443 |

Backend et frontend sont read-only, sans capabilities Linux, avec `/tmp`
temporaire. Les healthchecks ordonnent le démarrage. Les logs utilisent le
driver `json-file` avec rotation. Nginx écrit pid et caches temporaires dans
`/tmp`, sert les assets avec cache long et `index.html` sans cache afin de
préserver les déploiements SPA.

Le détail des topologies de déploiement (autonome vs VPS) est dans
[production.md](production.md).

## 16. Sécurité des dépendances

La politique d'exceptions bornées est décrite dans
[`security/dependency-exceptions.json`](../security/dependency-exceptions.json),
source normative lue par la CI, et appliquée par
[`scripts/dependency_exception_guard.py`](../scripts/dependency_exception_guard.py)
(fail-closed).

Deux exceptions sont actives, toutes deux bornées au **31 août 2026 inclus** :

| Advisory | Portée | Classification |
| --- | --- | --- |
| [`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | `react-router >=7.12.0 <8.3.0` | `not-applicable` — l'advisory cible les API React Server Components instables ; Sentinel reste sur React 18, React Router 7.18.2 en Declarative Mode, sans dépendance ni API RSC |
| [`GHSA-mh99-v99m-4gvg`](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | `brace-expansion <=5.0.7` | `upstream-dev-only` — présent uniquement dans les chaînes de développement Jest/ts-jest/ESLint/jsx-a11y ; absent de la fermeture runtime de l'application et des images |

Le garde échoue si le propriétaire, les GHSA, leurs bornes, classifications
ou l'échéance changent, si un lockfile change sans réévaluation, si la
version ou le mode Router change, si React quitte la majeure 18, si Brace
devient atteignable depuis les dépendances runtime, ou si une GHSA
supplémentaire high/critical apparaît sans être résolue vers l'une des deux
exceptions. La CI exécute les audits npm JSON runtime et complets des deux
workspaces, puis le job Containers inspecte les deux images applicatives
réellement construites.

Toute modification d'un `package-lock.json` fait échouer le hash enregistré
avec `D2 re-evaluation required` : la correction attendue est une nouvelle
revue complète (vérifier d'abord une mise à jour compatible qui supprimerait
l'exception), jamais une simple mise à jour de hash, un `npm audit fix
--force`, un retry ou un downgrade.

## 17. Backup et reprise applicative

`scripts/backup.sh` produit un dump gzip atomique avec checksum et
rétention. `scripts/restore.sh` valide le dump dans une base temporaire avant
une bascule de noms, avec arrêt court du backend et tentative de rollback en
cas d'échec. Les deux scripts partagent un même verrou de fichier : sauvegarde
et restauration ne peuvent jamais s'exécuter en même temps. La restauration
refuse par défaut tout dump sans checksum SHA-256 associé, importe dans une
base temporaire, valide la présence des tables du schéma et l'égalité exacte
du ledger `schema_migrations` avec les fichiers canoniques du checkout (noms,
ordre et checksums) avant d'échanger les noms de base. Un trap nettoie la
base temporaire et tente le retour arrière si la bascule est incomplète. Le
détail opérationnel (planification, hors site, restauration en production)
est dans [production.md](production.md).

## 18. Choix assumés et limites connues

### Choix assumés

- **Monolithe modulaire** : adapté au périmètre et plus simple à présenter,
  déployer et diagnostiquer que des microservices prématurés.
- **SQL direct** : les transactions, verrous et contraintes restent
  visibles ; les repositories empêchent leur dispersion dans les
  controllers.
- **Autorisation serveur** : l'interface masque les actions impossibles,
  mais la policy backend demeure la source de vérité.
- **Snapshots historiques** : la traçabilité survit aux changements du
  référentiel et à l'anonymisation.
- **Outbox** : le commit métier n'est pas couplé à la disponibilité SMTP.
- **Même origine en production** : moins de configuration navigateur et
  aucune URL interne compilée dans le frontend.

### Limites connues

- Sentinel est un monolithe mono-instance dans le Compose fourni ; l'outbox
  et le verrou de migration tolèrent plusieurs workers, mais un déploiement
  horizontal demanderait une stratégie explicite de sessions, santé et
  orchestration ;
- le rate limiting (`backend/src/utils/inMemoryRateLimit.ts`) est un
  compteur en mémoire de processus : il protège correctement une réplique
  unique mais ne partage aucun état entre instances. Tout passage à
  plusieurs répliques exige un stockage partagé (Redis ou équivalent) avant
  déploiement ;
- les migrations sont forward-only ; le rollback de schéma passe par une
  migration corrective ou une restauration ;
- l'observabilité repose sur logs et healthcheck, sans stack métrique
  fournie ;
- SMTP et DeepSeek sont des intégrations optionnelles à superviser
  séparément ;
- les tests de charge et audits de navigateur assistés restent des
  campagnes de recette, pas des preuves permanentes de la CI standard.
