# Architecture de Sentinel

## 1. Vue d'ensemble

Sentinel est un monolithe modulaire TypeScript, séparé en une SPA React, une API
Express et une base PostgreSQL. Le système privilégie des contrats explicites,
des transactions courtes et des contraintes SQL qui doublent les règles métier
critiques.

```text
React/Vite
   |
   | JSON + cookies HTTP-only
   v
Express
   |-- authentification et rate limiting
   |-- controllers HTTP
   |-- services métier et politiques de rôle
   |-- repositories SQL paramétré
   |-- worker d'outbox
   v
PostgreSQL
```

Trois audiences utilisent la même origine mais des sessions séparées :

- `admin` : administration du référentiel et de la sécurité ;
- `workshop` : utilisateurs atelier `OPERATOR`, `MAINTENANCE`, `RESPONSABLE` ;
- `board` : lecture seule du tableau grand écran.

## 2. Backend

### 2.1 Point d'entrée

`backend/src/server.ts` :

1. valide la configuration de production ;
2. installe CORS, logs structurés, headers de sécurité, limite JSON et cookies ;
3. applique le rate limiting global et celui des connexions ;
4. monte les routeurs du plus spécifique au plus générique ;
5. applique les migrations puis amorce l'admin si la base est vide ;
6. démarre HTTP et le worker d'outbox ;
7. ferme HTTP, worker et pool PostgreSQL sur SIGTERM/SIGINT.

La route `/api/health` vérifie une requête réelle vers PostgreSQL et répond 503
si la base n'est pas joignable.

### 2.2 Couches d'un module

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
attendues des exceptions techniques. Les contraintes uniques/foreign keys/checks
restent la dernière ligne de défense contre les courses concurrentes.

### 2.3 Modules

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

## 3. Authentification et sécurité

### 3.1 JWT cloisonnés

Chaque JWT :

- est signé en `HS256` avec un secret obligatoire ;
- porte l'issuer `sentinel` ;
- porte une audience et un champ `scope` identiques (`admin`, `workshop` ou
  `board`) ;
- est vérifié avec une liste d'algorithmes fermée ;
- contient une version de session comparée à la base.

Un token Board ne peut donc pas être accepté comme token Atelier ou Admin. Les
cookies sont HTTP-only, `sameSite=strict` et `secure` en production.

### 3.2 Révalidation serveur

Le middleware Atelier relit l'utilisateur à chaque requête sensible : existence,
activation, suppression, mot de passe, rôle et `session_version`. Une suspension,
un changement de rôle ou une rotation de mot de passe prend effet sans attendre
l'expiration du JWT.

L'admin suit la même logique avec son identifiant et sa version de session. La
base impose un seul enregistrement dans `admin_accounts` grâce à une clé singleton.

### 3.3 Actions sensibles

Les changements de mot de passe, de paramètres de sécurité et les opérations
administratives sensibles utilisent un service central de réauthentification.
Les mots de passe et le code Board sont hachés avec bcrypt. Les tokens de setup ou
de reset sont générés aléatoirement et seul leur condensat est stocké.

### 3.4 Défenses HTTP

- CORS limité à `CLIENT_ORIGIN` ;
- headers de sécurité applicatifs ;
- corps JSON limité à 50 Ko ;
- limite globale par IP et limite renforcée sur les connexions ;
- logs avec cookies et Authorization masqués ;
- timeout, taille de réponse, schéma Zod et rate limit sur le support IA ;
- messages d'erreur publics séparés des détails techniques.

## 4. Domaine Atelier

### 4.1 Rôles

- `OPERATOR` déclare et suit les incidents de production ;
- `MAINTENANCE` prend en charge, suspend, reprend et clôture selon les règles ;
- `RESPONSABLE` priorise, réordonne, arbitre et pilote.

La fonction backend `canPerform` est la source d'autorité. Le frontend reflète
les mêmes règles pour l'ergonomie, mais ne remplace jamais le contrôle serveur.

### 4.2 Cycle principal

```text
OPEN non pris -> OPEN pris -> PENDING -> OPEN pris -> CLOSED
      |              |           |             |
      +--------------+-----------+-------------+-> CANCELED
CLOSED -> INVALIDATED
```

Une prise en charge est une revendication ou un transfert explicite. Les champs
`is_taken`, `taken_by_user_id` et `taken_at` sont cohérents par contrainte SQL.
Une seule anomalie active peut exister pour un emplacement machine donné.

Voir [INCIDENT_LIFECYCLE.md](INCIDENT_LIFECYCLE.md) pour les transitions.

### 4.3 Arbitrage

Une demande de correction ou d'annulation crée un
`workshop_arbitration_cases` :

- `ACTIVE` : décision requise, compte dans la pastille de notification ;
- `CONSULTED` : le responsable a choisi explicitement « Consulter le dossier » ;
- `APPROVED` / `REJECTED` : décision finale ;
- `WITHDRAWN` / `SUPERSEDED` : demande retirée ou rendue caduque.

« Reporter » ferme la modale sans consulter le cas : il reste `ACTIVE`, la
pastille reste visible et la modale réapparaît à la prochaine ouverture. Ouvrir
le dossier pour une autre raison ne marque jamais l'arbitrage comme consulté.
Toutes les transitions de cas et d'incident sont effectuées dans la même
transaction et verrouillent les lignes concernées.

### 4.4 Traces et snapshots

Les événements d'incident conservent :

- l'action, l'horodatage et les changements ;
- l'acteur explicite (utilisateur atelier, admin ou système) ;
- des snapshots de nom, badge, rôle et ligne nécessaires à l'historique.

La suppression/anonymisation d'un compte ne détruit donc pas le sens des traces
historiques. Les annulations et invalidations sont conservées mais exclues des
métriques opérationnelles actives.

## 5. Données et migrations

### 5.1 Tables structurantes

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

### 5.2 Runner

`backend/src/db/migrate.ts` :

- ouvre un client PostgreSQL unique ;
- prend un advisory lock pour sérialiser les démarrages ;
- ordonne les fichiers SQL par nom ;
- calcule un SHA-256 de chaque fichier et le stocke dans `schema_migrations` ;
- refuse la modification ou la disparition d'une migration appliquée ;
- normalise l'ancien alias de nom de la migration 038 ;
- applique chaque nouvelle migration dans sa transaction.

Les migrations sont immuables après publication. Une correction de schéma est
toujours une nouvelle migration.

### 5.3 Intégrité récente

Les migrations 039 à 045 renforcent notamment :

- les acteurs et snapshots d'audit ;
- la machine à états d'arbitrage ;
- l'unicité de l'admin et les bornes des paramètres ;
- la normalisation des machines de ligne ;
- la validation SQL des payloads de machine ;
- l'unicité insensible à la casse des badges actifs ;
- l'outbox durable de notifications.

## 6. Notifications asynchrones

Les transactions métier insèrent un message dans `notification_outbox` au lieu
d'envoyer l'e-mail avant leur commit. Le worker :

1. réserve un lot avec verrouillage compatible multi-worker ;
2. tente l'envoi SMTP ;
3. marque le message envoyé ou planifie un retry avec backoff ;
4. abandonne après `NOTIFICATION_MAX_ATTEMPTS` en conservant la trace.

Les données dynamiques sont échappées avant insertion dans les modèles HTML.
L'arrêt gracieux attend la fin du worker avant de fermer le pool.

## 7. Frontend

### 7.1 Organisation

- `api/` : client fetch typé, timeout et signaux d'annulation ;
- `hooks/` : chargements atomiques, polling visible et mutations ;
- `components/` : cartes, dossiers, filtres, modales et navigation ;
- `pages/` : espaces fonctionnels ;
- `routes/` : contexte de session et gardes par audience/rôle ;
- `utils/` : permissions miroir, analytics, tri et markdown sûr.

Les routes sont chargées paresseusement. En production, l'API est same-origin ;
en développement, `VITE_API_URL` pointe vers le backend local.

### 7.2 Cohérence asynchrone

- un chargement périmé ne peut pas écraser un résultat plus récent ;
- les requêtes sont annulées au démontage ou au changement de filtre ;
- le polling s'arrête lorsque l'onglet est masqué et reprend au focus ;
- les mutations ont un verrou UI contre le double clic ;
- l'incident sélectionné est mis à jour atomiquement avec la liste.

### 7.3 Modales et responsive

Le composant `Modal` est rendu dans un portail unique et gère :

- verrouillage du body et arrière-plan `inert` ;
- pile de modales, Escape uniquement sur la couche supérieure ;
- piège de focus et restauration du déclencheur ;
- confirmation séparée des changements non enregistrés ;
- densité et actions bornées sur mobile sans débordement horizontal.

Le dossier incident adopte un panneau desktop et une navigation mobile qui place
le dossier en haut de la fenêtre. Les arbitrages mobiles sont couverts par
Playwright sur un viewport 393 x 851.

## 8. Infrastructure

### 8.1 Conteneurs

- PostgreSQL 15.18 sur réseau interne et volume persistant ;
- backend Node 24 non-root, lecture seule, `/tmp` borné ;
- frontend Nginx 1.30 non-root sur 8080 ;
- Caddy 2.11 en frontal, TLS automatique et compression zstd/gzip ;
- logs Docker avec rotation ;
- healthchecks et ordre de démarrage conditionné par la santé.

### 8.2 Sauvegarde

`scripts/backup.sh` produit un dump gzip atomique avec checksum et rétention.
`scripts/restore.sh` valide le dump dans une base temporaire avant une bascule de
noms, avec arrêt court du backend et tentative de rollback en cas d'échec.

### 8.3 CI

GitHub Actions exécute cinq contrats indépendants :

1. qualité et couverture backend ;
2. qualité et couverture frontend ;
3. intégration PostgreSQL réelle ;
4. parcours Playwright critiques ;
5. validation Compose, images non-root, Nginx, Caddy et scripts shell.

Dependabot surveille npm, Docker et GitHub Actions chaque semaine.

## 9. Choix assumés

- **Monolithe modulaire** : adapté au périmètre et plus simple à présenter,
  déployer et diagnostiquer que des microservices prématurés.
- **SQL direct** : les transactions, verrous et contraintes restent visibles ;
  les repositories empêchent leur dispersion dans les controllers.
- **Autorisation serveur** : l'interface masque les actions impossibles, mais la
  policy backend demeure la source de vérité.
- **Snapshots historiques** : la traçabilité survit aux changements du
  référentiel et à l'anonymisation.
- **Outbox** : le commit métier n'est pas couplé à la disponibilité SMTP.
- **Même origine en production** : moins de configuration navigateur et aucune
  URL interne compilée dans le frontend.
