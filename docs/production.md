# Production Sentinel

Déploiement, exploitation quotidienne, checklist de publication et preuves
d'audit de l'instance en production. La référence du code applicatif est
dans [technique.md](technique.md) ; la gouvernance du dépôt et des rulesets
GitHub est dans [collaboration.md](collaboration.md).

**Sommaire.** 1. Topologies · 2. Prérequis et installation · 3. Configuration
· 4. Préflight · 5. Déploiement d'une release · 6. Recette · 7. Sauvegarde et
restauration · 8. Sécurité d'exploitation · 9. Contrôles rapides et
diagnostic · 10. Rotation des secrets · 11. Procédures d'incident ·
12. Retour arrière · 13. Trace d'intervention · 14. Checklist de publication
· 15. Protocole d'audit de production · 16. État vérifié de l'instance
publique · 17. Publication GitHub — spécificités release.

Toutes les commandes ci-dessous s'exécutent depuis le répertoire de
déploiement (`SENTINEL_DIR=/var/www/sentinel` pour l'instance publique) et
utilisent la composition Compose de la topologie B, définie une fois pour
toutes :

```bash
COMPOSE=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.registry.yml)
```

## 1. Topologies de déploiement

Sentinel se déploie selon deux topologies distinctes, à ne jamais mélanger.

**Topologie A — distribution autonome (Caddy intégré) :**

```text
Internet
   |
   | 80 / 443
   v
Caddy (TLS, compression, reverse proxy)
   |----------------------|
   v                      v
Nginx non-root :8080   API Node non-root :3000
                          |
                          v
                    PostgreSQL :5432
```

Vise un déploiement autonome (démo, préproduction), pas l'instance publique.
Utilise le seul `docker-compose.yml` (+ `docker-compose.registry.yml` pour
une image de registry) : Caddy termine le TLS et publie `80`/`443`.

**Topologie B — frontal Nginx hôte, instance publique
`sentinel.akiksystems.fr` :**

```text
Internet -> Nginx hôte :443 -> 127.0.0.1:<port_frontend> -> frontend/Nginx :8080
                         \-> 127.0.0.1:<port_backend> -> API Node :3000 -> PostgreSQL
```

Le VPS possède déjà son Nginx ; Caddy ne démarre pas (profil `bundled-edge`
non activé). Les services applicatifs sont publiés **uniquement sur
`127.0.0.1`** via `docker-compose.host-proxy.example.yml`, et le Nginx hôte
termine le TLS.

Règles communes aux deux topologies :

- `postgres` appartient uniquement au réseau isolé `internal` et n'est
  jamais publié sur l'hôte ;
- seuls les ports `80` et `443` sont exposés publiquement ; la topologie B
  publie en plus deux binds privés sur `127.0.0.1`
  (`SENTINEL_FRONTEND_BIND_PORT`, `SENTINEL_BACKEND_BIND_PORT`), choisis par
  l'exploitant et reportés à l'identique dans le vhost Nginx ;
- les conteneurs applicatifs ont un système de fichiers en lecture seule, un
  `/tmp` borné et aucune capability Linux ;
- les images et runtimes sont épinglés dans les Dockerfiles et le Compose.

## 2. Prérequis et installation

- un VPS Linux maintenu avec Docker Engine et Docker Compose v2 ;
- un domaine dont les enregistrements A/AAAA pointent vers le VPS ;
- les ports entrants TCP 80 et 443 ouverts ;
- un accès SSH nominatif par clé ;
- un stockage hors site pour les sauvegardes PostgreSQL.

```bash
docker --version
docker compose version
ss -ltnp | grep -E ':(80|443)\b' || true
```

Pour la topologie A, arrêter ou reconfigurer tout Apache/Nginx/Caddy de
l'hôte qui utiliserait déjà 80/443. Pour la topologie B, copier l'override
d'exemple et choisir deux ports loopback libres :

```bash
cd "$SENTINEL_DIR"
cp docker-compose.host-proxy.example.yml docker-compose.override.yml
```

Adapter ensuite le virtual host Nginx à partir de
`deploy/nginx/sentinel.conf.example`. Les deux ports de publication loopback
sont **persistés dans le `.env`**, jamais laissés à de simples `export` de
session.

Installation initiale :

```bash
export SENTINEL_DIR=/var/www/sentinel
sudo install -d -o "$USER" -g "$USER" "$SENTINEL_DIR"
git clone <URL_DU_DEPOT> "$SENTINEL_DIR"
cd "$SENTINEL_DIR"
cp .env.release.example .env
chmod 600 .env
```

Ne jamais versionner `.env`. Toutes les valeurs `replace_with_...` doivent
être remplacées avant le premier démarrage.

## 3. Configuration (`.env`)

### Domaine et origine

```dotenv
CADDY_DOMAIN=sentinel.example.com
CLIENT_ORIGIN=https://sentinel.example.com
VITE_API_URL=
TRUST_PROXY=true
```

`CLIENT_ORIGIN` est l'origine HTTPS canonique exacte (`URL.origin`) : schéma,
hôte et éventuel port non standard, sans credentials, wildcard, chemin,
query, fragment ni slash final. La même validation alimente le démarrage,
CORS, CSRF et le préflight ; une valeur absente ou divergente arrête le
backend avant écoute. `VITE_API_URL` reste vide : le navigateur appelle
`/api` sur la même origine.

`BUILD_SHA` doit contenir les 40 caractères de `git rev-parse HEAD`. Le
backend refuse une valeur absente ou symbolique et la publie dans
`/api/health` pour permettre une comparaison exacte après déploiement.

### PostgreSQL

```dotenv
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=<mot_de_passe_aleatoire_long>
DATABASE_URL=postgres://sentinel:<mot_de_passe_encode_si_necessaire>@postgres:5432/sentinel
```

Si le mot de passe contient des caractères réservés dans une URL (`@`, `:`,
`/`, `?`, `#`), les encoder dans `DATABASE_URL` ou générer une valeur
hexadécimale.

### Secrets de session

```bash
openssl rand -hex 32   # COOKIE_SECRET
openssl rand -hex 32   # JWT_SECRET
```

Le backend refuse les valeurs absentes, trop courtes ou connues comme
valeurs de démonstration.

### Compte administrateur initial

```dotenv
ADMIN_USERNAME=admin-initial
ADMIN_PASSWORD=<mot_de_passe_temporaire_aleatoire_de_24_caracteres_ou_plus>
```

Ces variables servent uniquement à amorcer une base vide. Après le premier
démarrage :

1. se connecter ;
2. changer le mot de passe dans Administration > Sécurité ;
3. retirer `ADMIN_USERNAME` et `ADMIN_PASSWORD` de `.env` ;
4. recréer le backend **sans reconstruction locale** :

   ```bash
   docker compose "${COMPOSE[@]}" up -d --no-build --force-recreate backend
   ```

Les redémarrages suivants utilisent l'admin stocké en base. Sentinel impose
un seul compte administrateur au niveau SQL.

### Code Board

Le code n'est jamais stocké en clair ni en SHA-256. Générer un hash
**bcrypt** :

```bash
cd backend
npm ci
BOARD_ACCESS_CODE='code-temporaire-du-board' npm run hash:board
cd ..
```

Reporter la sortie complète `$2b$...` **entre quotes simples** : Docker
Compose interpolerait les `$` non quotés du `.env` et tronquerait le hash.

```dotenv
BOARD_ACCESS_CODE_HASH='$2b$10$abcdef...'
```

Le libellé et la durée de session Board sont ensuite administrables depuis
l'interface ; le hash d'environnement reste le bootstrap initial du code.

### Services optionnels

Le support IA et les e-mails se dégradent proprement lorsqu'ils ne sont pas
configurés :

```dotenv
DEEPSEEK_API_KEY=
SUPPORT_API_TIMEOUT_MS=20000

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Sentinel <noreply@sentinel.example.com>"
ADMIN_EMAIL=

NOTIFICATION_BATCH_SIZE=10
NOTIFICATION_MAX_ATTEMPTS=5
NOTIFICATION_POLL_INTERVAL_MS=5000
```

## 4. Préflight avant bascule

Le préflight **ne stoppe, ne remplace et ne reconfigure aucun service en
cours**, et ne modifie aucun fichier du dépôt (jamais le `.env`). Il peut
récupérer les images candidates et lance un conteneur backend éphémère, sans
dépendances, pour exécuter la garde de configuration de production. Il
n'affiche aucune valeur de secret.

Le préflight confronte le **digest déployé au `BUILD_SHA` attendu** : les
images doivent donc déjà être présentes localement — le `pull` s'exécute
avant le préflight, jamais après.

```bash
cd "$SENTINEL_DIR"
docker compose "${COMPOSE[@]}" pull
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"
```

Il refuse : une variable obligatoire manquante, un secret resté placeholder
ou trop court, un `BUILD_SHA` non conforme, un `BOARD_ACCESS_CODE_HASH` qui
n'est pas un bcrypt valide tel que le conteneur le recevra, une image sans
digest, un digest dont l'image ne correspond pas au `BUILD_SHA` attendu
(label OCI `org.opencontainers.image.revision` et SHA runtime du backend),
une publication hors loopback ou un PostgreSQL exposé. Ne jamais déployer
tant qu'un contrôle échoue.

## 5. Déploiement d'une release (topologie B, procédure unique)

L'instance publique déploie **une image de registry épinglée par digest**,
jamais une reconstruction locale : le VPS exécute exactement l'image
construite et vérifiée en CI. Les deux digests figurent dans les notes de la
release GitHub. La même procédure vaut pour le premier démarrage et pour
chaque mise à jour de version.

### 5.1 Renseigner les valeurs de release

```dotenv
# SHA git complet du commit de la release. À DÉRIVER du tag réellement
# déployé, jamais codé en dur : BUILD_SHA=$(git rev-parse <tag>^{commit})
BUILD_SHA=<sha_git_40_hex_du_tag>
# Images épinglées par digest (depuis les notes de la release)
SENTINEL_BACKEND_IMAGE=ghcr.io/amineakik/sentinel-fullstack/backend@sha256:...
SENTINEL_FRONTEND_IMAGE=ghcr.io/amineakik/sentinel-fullstack/frontend@sha256:...
# Ports de publication loopback (topologie B, PLACEHOLDERS à remplacer par
# les ports réels de l'hôte, reportés à l'identique dans le vhost Nginx)
SENTINEL_BACKEND_BIND_PORT=<port_backend_loopback>
SENTINEL_FRONTEND_BIND_PORT=<port_frontend_loopback>
```

Aligner le code sur le tag sans dépendre du `.env` suivi :

```bash
cd "$SENTINEL_DIR"
git fetch --tags origin
git checkout "$RELEASE_TAG"
cp docker-compose.registry.example.yml docker-compose.registry.yml
```

### 5.2 Sauvegarde → pull → préflight → déploiement → health → recette

```bash
# 1. sauvegarde
./scripts/backup.sh

# 2. pull des images par digest (docker login ghcr.io d'abord si privé) —
#    non destructif, aucun conteneur en cours n'est remplacé
docker compose "${COMPOSE[@]}" pull backend frontend

# 3. préflight (lit le .env du déploiement, ne remplace aucun service)
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"

# 4. déploiement sans reconstruction locale
docker compose "${COMPOSE[@]}" up -d --no-build --remove-orphans
docker compose "${COMPOSE[@]}" ps

# 5. health — la version doit égaler le SHA du tag déployé
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
```

Réponse santé attendue :

```json
{"status":"ok","db":"ok","version":"<sha_git_40_caracteres>"}
```

`version` doit égaler `git rev-parse "$RELEASE_TAG^{commit}"`, et le digest
de l'image backend déployée doit correspondre à `SENTINEL_BACKEND_IMAGE`.
Consigner les deux digests dans le procès-verbal de recette.

Le backend applique les migrations sous verrou PostgreSQL avant d'écouter ;
il refuse une migration déjà appliquée au checksum modifié ou un historique
référençant un fichier absent.

**Ne jamais `docker compose down` pour une mise à jour normale** : `up -d`
suffit à recréer uniquement les conteneurs dont l'image ou la configuration
a changé. Ne supprimer ni le volume `sentinel_data` ni les volumes Caddy.
Conserver le backup hors du VPS.

### 5.3 Annexe — Topologie A (distribution autonome)

Même ordre, avec seulement deux fichiers Compose (base + registry) :

```bash
COMPOSE_A=(-f docker-compose.yml -f docker-compose.registry.yml)
cd "$SENTINEL_DIR"
cp docker-compose.registry.example.yml docker-compose.registry.yml
./scripts/backup.sh
docker compose "${COMPOSE_A[@]}" pull backend frontend
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE_A[@]}"
docker compose "${COMPOSE_A[@]}" up -d --no-build --remove-orphans
curl --fail --show-error https://sentinel.example.com/api/health
```

Construction locale (développement/démo, pas une release certifiée — le
préflight de release ne s'y applique pas et refuse toute composition sans
digest) : `docker compose -f docker-compose.yml build backend frontend` puis
`docker compose -f docker-compose.yml up -d --remove-orphans`.

## 6. Recette

Contrôler les trois accès depuis un navigateur : portail, Board et
connexion Atelier. Les données Board ne doivent pas être accessibles sans
leur session dédiée.

- [ ] portail et trois espaces accessibles selon leurs droits
- [ ] authentification, déconnexion et expiration de session vérifiées
- [ ] compte inactif/supprimé refusé immédiatement
- [ ] création, prise en charge, attente, reprise et clôture d'incident
      vérifiées
- [ ] demande, report, consultation et décision d'arbitrage vérifiés
- [ ] changement de rôle en session pris en compte côté serveur
- [ ] historique, journal, pilotage et connaissance cohérents
- [ ] Board refusé sans session, puis fonctionnel par code dédié et par
      session Atelier
- [ ] affichage mobile 393 x 851 et desktop 1920 x 1080 contrôlé
- [ ] navigation clavier et libellés accessibles contrôlés

Voir le [runbook du retour arrière](#12-retour-arrière-rollback-par-digest-précédent)
en cas de problème.

## 7. Sauvegarde et restauration

### Manuelle

```bash
./scripts/backup.sh
./scripts/backup.sh --dir /srv/backups/sentinel --keep 30
```

Le script verrouille le répertoire pour éviter deux dumps concurrents,
vérifie que le service `postgres` tourne, produit un dump SQL sans
propriétaire ni privilèges, compresse dans un fichier temporaire, vérifie
l'archive, applique le mode `600` et crée un `.sha256`, puis supprime les
sauvegardes plus anciennes que la rétention configurée.

Validation manuelle :

```bash
gzip -t backups/sentinel_backup_*.sql.gz
cd backups && sha256sum -c sentinel_backup_YYYY-MM-DD_HH-MM-SS.sql.gz.sha256 && cd ..
```

### Planifiée

```cron
0 3 * * * cd /var/www/sentinel && ./scripts/backup.sh >> /var/log/sentinel-backup.log 2>&1
```

Le compte cron doit pouvoir exécuter Docker et lire `/var/www/sentinel/.env`.
Protéger le fichier de log et surveiller explicitement les codes de sortie.

### Hors site

Copier les couples `.sql.gz` / `.sha256` vers un stockage distinct, chiffré
et versionné. Une sauvegarde présente uniquement dans le volume du VPS ne
constitue pas un plan de reprise.

Politique minimale recommandée : 7 sauvegardes quotidiennes, 4
hebdomadaires, 3 mensuelles, un test de restauration trimestriel sur une
base isolée. `scripts/test-backup-restore.sh` réalise cet exercice de bout
en bout dans un projet Compose jetable et unique, mesure le RTO et prouve
son isolation ; il est sûr à lancer depuis le répertoire de production, le
projet de production n'étant jamais ciblé.

### Restauration

Préconditions : identifier l'heure exacte du point de reprise, conserver une
copie du backup actuel, prévenir les utilisateurs, vérifier l'espace disque,
ne pas interrompre le script pendant la bascule.

```bash
./scripts/restore.sh backups/sentinel_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
```

Le script refuse de démarrer si une sauvegarde est en cours (verrou partagé
avec `backup.sh`), et refuse tout dump sans `.sha256` associé sauf ajout
explicite de `--allow-unverified` (journalise un avertissement audité). Il
importe dans une base temporaire, contrôle le schéma, exige que le ledger
corresponde exactement aux migrations canoniques du checkout (noms, ordre et
checksums), puis arrête le backend et bascule les bases. En cas d'échec
avant la fin de la bascule, son trap tente de restaurer le nom de la base
initiale.

Après restauration :

```bash
docker compose "${COMPOSE[@]}" ps
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
docker compose "${COMPOSE[@]}" logs --since=10m backend postgres
```

Puis une recette fonctionnelle : connexion, ouverture d'un incident,
historique, Board et dernier événement d'audit attendu.

## 8. Sécurité d'exploitation

- limiter SSH par pare-feu et clé ;
- garder Docker, le noyau et les paquets du VPS à jour ;
- ne jamais exposer directement 3000, 5432 ou 8080 ;
- protéger `.env` avec le mode `600` ;
- utiliser des identifiants SMTP dédiés et révocables ;
- faire tourner les secrets après un départ ou un soupçon de fuite ;
- surveiller les échecs de connexion et les erreurs 5xx dans les logs ;
- tester périodiquement une restauration sur un environnement isolé ;
- conserver au moins une sauvegarde chiffrée hors site.

## 9. Contrôles rapides et diagnostic

```bash
docker compose "${COMPOSE[@]}" config --quiet
docker compose "${COMPOSE[@]}" ps
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
docker compose "${COMPOSE[@]}" logs --since=15m backend frontend postgres
```

État nominal : `postgres`, `backend` et `frontend` sont `healthy` ; `caddy`
n'est **pas** lancé (le TLS est terminé par le Nginx hôte) ; `/api/health`
répond HTTP 200 et sa propriété `version` égale le SHA du tag déployé ;
aucune boucle de redémarrage n'apparaît.

Le frontal TLS étant le Nginx hôte, ses diagnostics ne passent pas par
Compose :

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -n 100 /var/log/nginx/error.log
```

### Contrat des en-têtes du Nginx hôte

Le modèle versionné est `deploy/nginx/sentinel.conf.example`. Trois
autorités disjointes : le Nginx hôte est l'unique autorité HSTS et masque le
HSTS des upstreams ; le Nginx frontend pose les autres en-têtes des
documents et statiques ; Node pose les autres en-têtes de `/api/*`. La
directive suivante, placée dans le serveur HTTPS, empêche l'héritage en bloc
d'éventuels `add_header` globaux :

```nginx
add_header X-Sentinel-Inheritance-Barrier "";
```

Nginx n'émet pas un en-tête dont la valeur est vide : cette barrière ne doit
donc jamais apparaître dans une réponse publique. Contrôle local
reproductible (exige un vrai binaire Nginx 1.18.0, celui du serveur hôte) :

```bash
./scripts/test-nginx-header-inheritance.sh --nginx-bin /chemin/vers/nginx
```

### Application du modèle Nginx hôte

Opération de déploiement séparée, à exécuter seulement après autorisation
explicite. Identifier d'abord le fichier réellement inclus avec
`sudo nginx -T` plutôt que de supposer son chemin.

```bash
SENTINEL_NGINX_TARGET=/etc/nginx/sites-available/sentinel
SENTINEL_NGINX_BACKUP=/etc/nginx/sites-available/sentinel.before-update
SENTINEL_NGINX_STAGE=/etc/nginx/sites-available/.sentinel.new

# 1. sauvegarde atomique, conservée jusqu'à validation complète
sudo install -m 0600 "$SENTINEL_NGINX_TARGET" "${SENTINEL_NGINX_BACKUP}.tmp"
sudo mv "${SENTINEL_NGINX_BACKUP}.tmp" "$SENTINEL_NGINX_BACKUP"

# 2. copie puis bascule atomique sur le même système de fichiers
sudo install -m 0644 deploy/nginx/sentinel.conf.example "$SENTINEL_NGINX_STAGE"
sudo mv "$SENTINEL_NGINX_STAGE" "$SENTINEL_NGINX_TARGET"

# 3. validation avant tout reload
sudo nginx -t

# 4. reload sans arrêt si, et seulement si, nginx -t est vert
sudo systemctl reload nginx

# 5. contrôle public exact, sans secret ni donnée d'authentification
./scripts/verify-public-headers.sh https://sentinel.akiksystems.fr
```

Si `nginx -t`, le reload ou le contrôle public échoue, restaurer
immédiatement la sauvegarde par une seconde bascule atomique, revalider,
puis recharger. Conserver la sortie de `nginx -t`, du reload et du
vérificateur dans la trace d'intervention.

### Variables critiques

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `BUILD_SHA` | oui | SHA git 40 hex du tag ; embarqué dans l'image et publié par `/api/health` |
| `SENTINEL_BACKEND_IMAGE` | oui (topo B) | image backend épinglée par digest `@sha256:` |
| `SENTINEL_FRONTEND_IMAGE` | oui (topo B) | image frontend épinglée par digest `@sha256:` |
| `SENTINEL_BACKEND_BIND_PORT` | oui (topo B) | port loopback de publication du backend |
| `SENTINEL_FRONTEND_BIND_PORT` | oui (topo B) | port loopback de publication du frontend |
| `CLIENT_ORIGIN` | oui | origine HTTPS canonique exacte autorisée par CORS/CSRF |
| `TRUST_PROXY` | oui | prise en compte sûre de l'IP via le proxy inverse |
| `POSTGRES_PASSWORD` | oui | mot de passe du service PostgreSQL |
| `DATABASE_URL` | oui | connexion interne du backend à PostgreSQL |
| `COOKIE_SECRET` | oui | signature des cookies Express |
| `JWT_SECRET` | oui | signature des sessions JWT |
| `BOARD_ACCESS_CODE_HASH` | oui | hash bcrypt du code Board initial (entre quotes simples) |
| `ADMIN_USERNAME` | base vide | bootstrap Admin, non vide, max. 80 caractères, non numérique |
| `ADMIN_PASSWORD` | base vide | mot de passe temporaire du premier admin |
| `CADDY_DOMAIN` | topo A | domaine servi par Caddy (annexe uniquement) |

Ne jamais mettre un secret dans une commande versionnée, un ticket public ou
une capture d'écran.

### Logs et test de charge

```bash
docker compose "${COMPOSE[@]}" logs --follow --tail=200 backend
docker compose "${COMPOSE[@]}" logs --since=1h backend | grep -Ei 'error|fatal|migration|shutdown'
docker compose "${COMPOSE[@]}" stats --no-stream
```

Les logs Docker sont limités à cinq fichiers de 10 Mo par service. Le
backend masque, dans les journaux HTTP, les cookies et en-têtes
d'autorisation entrants ainsi que le `Set-Cookie` sortant
(`backend/src/httpLogging.ts`, couvert par un test de journalisation
réelle).

`scripts/load-test.js` (k6) mesure la latence de `/api/health` sous un
débit constant de 2 req/s pendant deux minutes — sous le seuil de rate
limiting nominal (`GLOBAL_API_RATE_LIMIT_MAX=3000` sur 15 min, soit
~3,3 req/s/IP). Manuel, non intégré à la CI, à exécuter contre une instance
dédiée :

```bash
k6 run --env BASE_URL=http://127.0.0.1:<port_backend_loopback> scripts/load-test.js
```

Seuils attendus : moins de 1 % d'échecs, p95 sous 300 ms, p99 sous 800 ms.

## 10. Rotation des secrets

**Cookie et JWT.** Générer deux nouvelles valeurs (`openssl rand -hex 32`),
les remplacer dans `.env`, puis recréer le backend sans reconstruction
locale (`up -d --no-build --force-recreate backend`). La rotation de
`JWT_SECRET` invalide toutes les sessions : planifier l'opération et
prévenir les utilisateurs.

**Code Board.** Voie normale : Administration > Paramètres. Procédure de
secours :

```bash
cd backend
BOARD_ACCESS_CODE='nouveau-code-temporaire' npm run hash:board
cd ..
```

Mettre le hash bcrypt dans `.env` entre quotes simples, recréer le backend,
vérifier une nouvelle connexion Board. Les sessions Board antérieures
peuvent rester valides jusqu'à expiration ; une rotation du `JWT_SECRET` les
invalide toutes.

**Mot de passe admin.** Voie normale : Administration > Sécurité. Si l'accès
est perdu :

```bash
docker compose "${COMPOSE[@]}" exec -T backend node dist/scripts/reset-admin-password.js
```

La commande choisit l'admin unique, remplace son mot de passe dans une
transaction et incrémente `session_version`. Le mot de passe temporaire est
affiché une seule fois dans le terminal ; le transmettre par un canal
interne sûr puis le changer immédiatement dans l'interface.

**PostgreSQL.** Exige une fenêtre de maintenance : backup, arrêt de
l'application, modification du rôle PostgreSQL, mise à jour simultanée de
`POSTGRES_PASSWORD` et `DATABASE_URL`, redémarrage et test de santé. Tester
sur un environnement de préproduction avant la production.

## 11. Procédures d'incident

**Site inaccessible.**

```bash
docker compose "${COMPOSE[@]}" ps
docker compose "${COMPOSE[@]}" logs --since=15m frontend backend
curl --verbose https://sentinel.akiksystems.fr/api/health
sudo nginx -t && sudo systemctl status nginx
```

Échec TLS : contrôler DNS, ports 80/443, horloge et logs du Nginx hôte.
Frontend sain mais API 502/503 : contrôler backend et PostgreSQL, et que le
`proxy_pass` du vhost pointe le bon port loopback. Service arrêté : lire ses
logs avant de le relancer. Boucle de redémarrage : ne pas masquer l'erreur
avec des redémarrages répétés.

**PostgreSQL indisponible.**

```bash
docker compose "${COMPOSE[@]}" ps postgres
docker compose "${COMPOSE[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER:-sentinel}" -d "${POSTGRES_DB:-sentinel}"
```

Vérifier l'espace disque et les permissions du volume. Ne restaurer qu'après
avoir distingué une indisponibilité transitoire d'une corruption réelle.

**Migration refusée.** Le backend s'arrête si le ledger contient une
migration absente ou si le checksum d'une migration appliquée ne correspond
plus au fichier. Ne jamais modifier une migration publiée : restaurer le
fichier d'origine ou ajouter une migration corrective, puis publier une
nouvelle release.

**Notifications en échec.** Vérifier SMTP et les logs du worker. L'outbox
conserve les tentatives, applique un backoff et marque les messages
définitivement échoués après la limite configurée. Corriger la
configuration avant de relancer le backend.

**Espace disque saturé.**

```bash
df -h
docker system df
du -sh backups/* 2>/dev/null | sort -h
```

Exporter les backups avant suppression. Ne jamais exécuter
`docker compose … down -v` : l'option `-v` supprimerait les données
PostgreSQL.

## 12. Retour arrière (rollback par digest précédent)

Le rollback de l'instance publique **ne reconstruit rien** et ne fait pas de
`git checkout` de production : on redéploie les digests de la release
précédente. Un rollback du code n'implique pas automatiquement un rollback
du schéma : vérifier d'abord si les migrations de la release fautive restent
compatibles avec le commit précédent.

```bash
cd "$SENTINEL_DIR"
# 1. remettre dans .env les valeurs de la release PRÉCÉDENTE (BUILD_SHA +
#    digests @sha256:), relevées lors de son propre déploiement
docker compose "${COMPOSE[@]}" pull backend frontend
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"
docker compose "${COMPOSE[@]}" up -d --no-build --remove-orphans
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
```

Si le schéma n'est pas rétrocompatible, restaurer le backup pris juste
avant le déploiement, puis redéployer les digests précédents.

## 13. Trace d'intervention

Pour chaque opération sensible, consigner hors du dépôt : date, intervenant
et motif ; `BUILD_SHA` et digests déployés avant/après (indispensables au
rollback) ; backup utilisé et checksum ; commandes structurantes exécutées ;
résultat des contrôles de santé et de recette ; décision de clôture ou
d'escalade.

## 14. Checklist de publication

Une publication est autorisée uniquement lorsque chaque contrôle applicable
est coché et rattaché au commit candidat. **Décision : `GO` seulement si
aucun point bloquant n'est ouvert.** Toute dérogation doit être écrite,
limitée dans le temps et assortie d'un responsable.

### Dépôt

- [ ] la branche cible est `main` et synchronisée avec `origin/main`
- [ ] `git status --short` ne contient aucun fichier inattendu
- [ ] aucun `.env`, secret, export de données, PDF/DOCX personnel ou
      artefact de build n'est suivi
- [ ] `git diff --check` ne signale aucune erreur d'espace ou marqueur de
      conflit
- [ ] les migrations déjà publiées n'ont pas été modifiées
- [ ] toute nouvelle migration est séquentielle, relue et couverte par un
      test réel
- [ ] technique.md, conception.md, production.md décrivent le code du
      commit

### Backend

```bash
cd backend && npm ci && npm run format:check && npm run lint \
  && npm run typecheck:scripts && npm run build && npm run test:coverage \
  && npm run verify:reliability && npm audit --omit=dev --audit-level=high
```

- [ ] toutes les commandes réussissent
- [ ] les seuils Jest restent au-dessus de 80 % statements, 75 % branches,
      70 % fonctions et 85 % lignes sur le périmètre critique
- [ ] aucun test ciblé, ignoré ou exclusif n'a été laissé par erreur
- [ ] les mutations critiques restent transactionnelles et actor-aware
- [ ] les erreurs SQL attendues sont traduites sans fuite d'information
- [ ] l'arrêt SIGTERM ferme HTTP, worker d'outbox et pool PostgreSQL
      proprement

### PostgreSQL réel

```bash
cd backend
export DATABASE_URL=postgres://sentinel:<password>@localhost:5432/sentinel_test
npm run test:integration
```

- [ ] les migrations partent d'une base vide
- [ ] une seconde exécution du runner est idempotente
- [ ] les suites auth, comptes, lignes et atelier réussissent
- [ ] les contraintes SQL refusent les payloads et transitions invalides
- [ ] le ledger de migrations contient un checksum pour chaque migration

### Frontend

```bash
cd frontend && npm ci && npm run format:check && npm run lint \
  && npm run build && npm run test:coverage \
  && npm audit --omit=dev --audit-level=high
```

- [ ] toutes les commandes réussissent
- [ ] les seuils Vitest restent au-dessus de 85 % statements, 80 %
      branches, 90 % fonctions et 90 % lignes sur le périmètre critique
- [ ] les appels annulés ne produisent ni erreur visible ni état obsolète
- [ ] les mutations empêchent les doubles soumissions
- [ ] les modales restaurent le focus, piègent Tab et répondent à Escape
- [ ] les erreurs métier restent distinguées des erreurs réseau/timeout

### Parcours E2E

```bash
cd frontend && npx playwright install chromium && npm run test:e2e
```

- [ ] modification d'une machine simple validée
- [ ] passage simple vers double robot validé
- [ ] arbitrage d'annulation décidé directement dans la modale mobile
- [ ] arbitrage de correction décidé directement dans la modale mobile
- [ ] Reporter conserve le cas actif et ouvre le dossier en haut sur mobile
- [ ] aucune modale, aucun bouton et aucun contenu ne déborde
      horizontalement
- [ ] le body est verrouillé pendant une modale et redevient scrollable
      après fermeture
- [ ] corps de carte, titre, Entrée et Espace activent le dossier ; étoile
      et arbitrage restent indépendants
- [ ] panneau haut/milieu/bas, molette interne, mobile, resize et zoom
      200 % sont verts
- [ ] motif Board avant/après reprise, correction et annulation complètes
      sont verts
- [ ] erreurs et réessais Admin/Auth/Board/Support conservent saisie,
      modale et focus
- [ ] axe-core ne signale aucune violation critique ou sérieuse sur les
      pages et états principaux

### Configuration production

- [ ] `.env` provient de `.env.release.example` et a le mode `600`
- [ ] tous les placeholders ont été remplacés
- [ ] `BUILD_SHA` est égal à `git rev-parse HEAD`
- [ ] `CLIENT_ORIGIN` est l'origine HTTPS canonique exacte du domaine réel
- [ ] `CADDY_DOMAIN` cible ce domaine avec le frontal intégré, ou Caddy est
      désactivé par l'override Nginx hôte
- [ ] `VITE_API_URL` est vide pour l'API same-origin
- [ ] `TRUST_PROXY=true` derrière le proxy inverse retenu
- [ ] `COOKIE_SECRET` et `JWT_SECRET` sont longs, aléatoires et distincts
- [ ] `POSTGRES_PASSWORD` est long et cohérent avec `DATABASE_URL`
- [ ] `BOARD_ACCESS_CODE_HASH` est un hash bcrypt valide `$2...`
- [ ] les variables admin ne servent qu'au bootstrap d'une base vide
- [ ] SMTP/DeepSeek sont configurés ou leur désactivation est acceptée
      explicitement
- [ ] `docker compose config --quiet` réussit

### Conteneurs

- [ ] les images backend et frontend se construisent sans cache local
      implicite
- [ ] l'image backend ne contient ni tests compilés, ni déclarations, ni
      source maps
- [ ] backend et frontend s'exécutent avec les utilisateurs `node` et
      `nginx`
- [ ] Nginx démarre avec filesystem read-only et `/tmp` dédié
- [ ] la configuration Caddy est valide pour la distribution autonome
- [ ] seuls 80/443 sont publics ; la variante Nginx hôte ne lie l'API et le
      frontend qu'à `127.0.0.1`
- [ ] PostgreSQL n'est attaché qu'au réseau interne
- [ ] healthchecks backend, frontend et PostgreSQL passent
- [ ] les logs sont bornés par rotation
- [ ] ShellCheck valide tous les scripts shell suivis
- [ ] les deux seules exceptions upstream high (voir
      [technique.md](technique.md) §16) satisfont la garde bornée au
      31 août 2026, sans `npm audit fix --force`

### Exploitation

- [ ] backup pré-déploiement créé et checksum vérifié
- [ ] copie hors site confirmée
- [ ] restauration testée sur un environnement isolé
- [ ] compatibilité du schéma avec le rollback évaluée
- [ ] métrique de santé et logs consultables
- [ ] fenêtre, responsable et procédure de retour arrière définis

### Publication

- [ ] les réglages distants de gouvernance GitHub (§17 ci-dessous et
      [collaboration.md](collaboration.md)) sont prouvés : SHA pins,
      rulesets, checks et environnement applicable conformes au profil
      mono-mainteneur, limité à `main`
- [ ] CI GitHub verte sur le SHA exact à publier, sur `main`
- [ ] commit et message de publication relus
- [ ] tag de version créé sur ce SHA (`v1.0.0-rc.N` puis `v1.0.0`)
- [ ] workflow `Release` lancé explicitement depuis `main` avec ce tag dans
      l'entrée `tag` (jamais depuis la ref du tag)
- [ ] en cas d'échec après création de la draft de réservation, ne pas
      supprimer la draft ni réutiliser le tag : diagnostiquer puis publier
      une nouvelle version
- [ ] le workflow `Release` a construit et poussé les images GHCR sans
      échec
- [ ] la release GitHub référence les deux digests d'images immuables
- [ ] déploiement effectué par image de registry épinglée par digest, pas
      par reconstruction locale
- [ ] `/api/health` répond HTTP 200 après déploiement
- [ ] la propriété `version` de `/api/health` égale le SHA du tag déployé
- [ ] les digests des images déployées égalent ceux de la release
- [ ] logs post-déploiement sans erreur inattendue
- [ ] recette courte Admin/Atelier/Board réussie
- [ ] SHA, tag, digests d'images et résultat de recette consignés

## 15. Protocole d'audit de production

Ce protocole complète la checklist de publication (§14). Il décrit les
campagnes qui exigent un environnement iso-production et ne doivent pas être
confondues avec les contrôles automatiques de chaque commit.

### Conditions de départ

Commit candidat identifié par SHA et CI entièrement verte ; images
construites depuis ce SHA sans modification locale ; environnement séparé de
la production mais de topologie identique ; `NODE_ENV=production` avec
secrets temporaires forts ; PostgreSQL dédié et backup initial ; jeu de
données anonymisé ou synthétique ; fenêtre et responsable de test définis.
Une ligne en échec non expliquée bloque le GO.

### Contrats automatiques obligatoires

Les six jobs de `.github/workflows/ci.yml` doivent réussir (détail en
[technique.md](technique.md) §14). Vérifier également qu'aucun test n'est
marqué `only`, qu'aucun artefact de test n'est suivi et que Dependabot n'a
pas d'alerte high/critical non traitée.

### Données et volume

Préparer au minimum : 50 lignes, 200 machines, 10 000 incidents répartis sur
plusieurs mois, incidents actifs/en attente/clôturés/annulés/invalidés, cas
d'arbitrage actifs/consultés/décidés, événements/followers/outbox
représentatifs.

Objectifs indicatifs (navigateur sans cache puis cache chaud) : dashboard
actif < 1 s sur LAN ; historique filtré p95 < 500 ms ; pilotage 30 jours p95
< 1 s ; Board stable sans croissance mémoire ; recherche p95 < 500 ms. Les
objectifs doivent être adaptés à l'infrastructure réelle et consignés avec
CPU, RAM, latence réseau et volume exact.

### Charge et endurance

Scénarios avec k6, Artillery ou équivalent : lecture `/api/health` de
référence ; lecture incidents authentifiée filtrée ; polling Board
multi-écrans ; créations concurrentes sur emplacements différents ;
collision volontaire sur le même emplacement ; décisions concurrentes sur un
même arbitrage ; endurance 30 à 60 minutes à charge nominale.

Critères minimaux : aucune violation d'unicité métier ; aucun double
événement ni double élément d'outbox pour une même source ; le scénario de
crash après acceptation SMTP documente le risque résiduel de nouvel envoi
inhérent à la livraison « au moins une fois » ; aucun 5xx inexpliqué ;
mémoire backend sans croissance linéaire ; pool PostgreSQL stable ; p95 et
taux d'erreur conformes aux objectifs.

### Sécurité dynamique

**Sessions.** Token Admin sur route Atelier : refus. Token Atelier sur route
Admin : refus. Token Board ailleurs que `/api/board` : refus. Token Atelier
autorisé sur la projection Board mais jamais sur l'Admin. Token signé avec
autre audience/issuer/algorithme : refus. Changement de rôle, désactivation
et rotation : session immédiatement refusée. Cookies `HttpOnly`, `Secure`,
`SameSite=Strict` sous HTTPS.

**Entrées.** Payload JSON > 50 Ko refusé. Recherches avec quotes, wildcards
et Unicode sans injection. HTML/script dans noms, commentaires, motifs,
support et e-mails échappé. IDs invalides et objets JSON mal formés
retournent 4xx. Conflits SQL concurrents retournent une erreur métier
stable.

**Infrastructure.** TLS valide et renouvelable ; headers vérifiés avec un
outil externe ; aucun port applicatif accessible publiquement (topologie
A : seul Caddy expose 80/443 ; topologie B : loopback uniquement) ;
PostgreSQL jamais publié ; conteneurs frontend/backend non-root et
read-only ; `.env` non lisible par les autres comptes ; logs sans cookie ni
bearer entrant, sans `Set-Cookie` sortant, sans mot de passe ni clé API. Un
scan DAST peut compléter ces tests, mais ses alertes doivent être vérifiées
manuellement avant conclusion.

### Accessibilité

Sur les pages principales et les deux formats 393 x 851 / 1920 x 1080 :
Lighthouse/axe sans violation critique ; navigation complète au clavier ;
ordre de focus cohérent ; modale : focus initial, piège, Escape,
restauration ; lecteurs NVDA ou VoiceOver sur login, dashboard et
arbitrage ; zoom navigateur 200 % sans perte d'action ; contraste AA pour
texte et contrôles ; `prefers-reduced-motion` respecté. Les scores
automatiques ne remplacent pas la passe clavier/lecteur d'écran.

### Responsive et compatibilité

Navigateurs : versions récentes de Chrome, Edge, Firefox et Safari.
Viewports : téléphone 393 x 851, tablette portrait/paysage, desktop
1366 x 768 et 1920 x 1080, écran Board cible réel. Contrôler : absence de
scroll horizontal, taille des cibles, modales d'arbitrage, ouverture du
dossier, restauration de position, clavier virtuel, menu mobile et rotation
du Board.

### Dégradations

| Panne simulée | Attendu |
| --- | --- |
| PostgreSQL coupé | santé 503, erreur explicite, aucun faux succès |
| SMTP coupé | décision métier validée, outbox en retry |
| DeepSeek lent/invalide | timeout borné, support en erreur seulement |
| backend redémarré | sessions cohérentes, worker reprend l'outbox |
| double clic / réseau lent | une mutation au plus |
| réponse précédente tardive | aucun état UI obsolète |
| SIGTERM pendant trafic | arrêt gracieux dans la fenêtre Compose |

### Reprise

Campagne obligatoire sur l'environnement dédié : créer un backup, vérifier
gzip et checksum, modifier des données témoins, restaurer, comparer les
données témoins et le ledger de migrations, rejouer santé/connexion/incident
/audit, mesurer RTO et point de reprise obtenu, vérifier la copie hors site.
Ne jamais présenter un script non exécuté comme une restauration prouvée.

### Décision

Le compte rendu doit inclure : SHA, date, environnement, versions, volumes,
commandes, métriques, captures utiles, anomalies, risques acceptés et
signataires.

- **GO** : aucun bloquant, preuves complètes ;
- **GO conditionnel** : uniquement réserves non bloquantes avec responsable
  et échéance ;
- **NO-GO** : intégrité, sécurité, reprise ou parcours critique non prouvé.

## 16. État vérifié de l'instance publique

Dernière vérification : **31 juillet 2026**, sur le SHA
`deecf6d57d3f0304e18fe9fd56847f5d9cd0d1a7` (tag `v1.0.0-rc.8`).

- `/api/health` répond `{"status":"ok","db":"ok","version":"deecf6d57d3f0304e18fe9fd56847f5d9cd0d1a7"}` ;
- le DNS A de `sentinel.akiksystems.fr` pointe vers l'adresse du VPS, les
  ports 80 et 443 répondent avec `Server: nginx`, HTTP redirige vers HTTPS ;
- le certificat TLS couvre exactement le domaine, HSTS et les en-têtes
  publics attendus sont présents ;
- le VPS est aligné sur le candidat décrit dans le dossier de projet : le
  dépôt et l'instance publique désignent le même commit.

**Preuves de qualité correspondantes** (rejouées et vérifiées sur ce même
SHA) :

| Suite | Résultat |
| --- | --- |
| Backend Jest (unitaire) | 626 / 626 |
| Fiabilité structurelle | 17 / 17 |
| Frontend Vitest | 787 / 787 |
| Couverture backend | 84,23 % statements · 79,39 % branches · 78,70 % fonctions · 88,98 % lignes |
| Couverture frontend | 90,38 % statements · 83,75 % branches · 92,36 % fonctions · 92,63 % lignes |
| Audit npm — backend runtime | 0 high |
| Audit npm — backend complet | 20 high, tous résolus vers `GHSA-mh99-v99m-4gvg` |
| Audit npm — frontend runtime | 2 high, résolus vers `GHSA-qwww-vcr4-c8h2` |
| Audit npm — frontend complet | 8 high, résolus vers les deux GHSA approuvées |
| Dépôt | 577 fichiers suivis, 50 migrations (001-050, sans trou) |
| CI | 6 jobs indépendants, tous verts sur ce SHA |

Sans accès SSH nominatif au VPS, cette section ne prouve pas les fichiers
Compose actifs, les binds loopback ni les images/digests internes : ces
points restent à contrôler lors de la prochaine recette VPS autorisée
(§6). Elle prouve en revanche, de façon vérifiable par quiconque, que le
service exposé publiquement exécute le commit exact décrit dans l'ensemble
de cette documentation.

### Historique des audits

L'instance a fait l'objet de plusieurs campagnes d'audit datées au fil des
candidats RC3 à RC8, chacune consignée avec son propre SHA, ses propres
résultats de test et sa propre décision (GO / GO conditionnel / NO-GO). Ces
rapports historiques — y compris un verdict du 17 juillet 2026 explicitement
invalidé après coup parce que le VPS n'était alors pas encore aligné sur le
candidat audité — restent conservés dans l'historique Git comme preuve d'un
processus itératif réel plutôt qu'effacés ou réécrits. Seul l'état ci-dessus
fait foi pour la version actuellement présentée.

## 17. Publication GitHub — spécificités release

La gouvernance générale du dépôt (branche `main`, rulesets, actions
épinglées) est décrite dans [collaboration.md](collaboration.md). Cette
section couvre les points spécifiques au moment de la publication.

### Environnement `prerelease`

Le workflow de publication est protégé par un GitHub Environment
`prerelease`, relu avant chaque exécution :

- nom exact `prerelease` ;
- zéro règle `required_reviewers` (mono-mainteneur, sans reviewer simulé) ;
- zéro secret d'environnement ;
- `protected_branches: false`, `custom_branch_policies: true` ;
- une unique deployment branch policy `{name: "main", type: "branch"}`.

Le garde de publication refuse un environnement absent, un nom différent,
toute règle reviewer fictive ou toute policy différente de l'unique branche
`main`, avant réservation de release, authentification GHCR ou push
d'image.

### Outils et images épinglés par digest

- Buildx : image `docker/buildx-bin:0.35.0`, manifeste
  `sha256:917570d8d0ae91ae49251f84f848a6801eedd114554c56a4fdf7ec88cac48eeb` ;
  le workflow refuse le binaire si `docker buildx version` ne renvoie pas
  exactement `v0.35.0` ;
- BuildKit : manifeste
  `sha256:2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec` ;
- Syft `v1.33.0` : manifeste
  `sha256:f94e5d9fce1f2278491a8e3a63bd5f6ddb81fdfdbb8bf7a1637565c1d5344357` ;
- les bases Node, Nginx, PostgreSQL et Caddy des images/Compose sont toutes
  versionnées et fixées par digest, de même que les outils tirés par les
  six checks CI (Nginx de validation, ShellCheck, Actionlint, Alpine de
  probe, registre local, PostgreSQL jetable).

Une évolution de Buildx, BuildKit ou Syft doit modifier explicitement ces
preuves et repasser les tests du workflow ; aucun `latest` implicite n'est
autorisé.

### Attestations et draft de réservation

Après le garde d'environnement, le workflow crée une draft minimale **avant**
toute authentification registre : cette réservation atomique brûle le tag de
publication. Il pousse ensuite les images, attache deux SBOM SPDX sans
`--clobber`, renseigne les notes, puis publie la draft. Toute panne après
réservation laisse la draft en place ; aucun rerun ni écrasement d'image
n'est autorisé avec ce tag, et la reprise exige une nouvelle version.

Quatre attestations au total (deux de provenance, deux SBOM), une paire par
image. Chaque job ne conserve que les permissions nécessaires
(`id-token: write`, `attestations: write`, avec `contents`/`packages`
uniquement là où la publication l'exige).

### Contrôle distant après configuration

Lectures qui ne modifient aucun réglage :

```bash
gh api repos/AmineAKIK/sentinel-fullstack/actions/permissions
gh api repos/AmineAKIK/sentinel-fullstack/environments/prerelease
gh api repos/AmineAKIK/sentinel-fullstack/rulesets
gh api repos/AmineAKIK/sentinel-fullstack/branches/main/protection
```

Dry-run local sans token, avant toute publication réelle :

```bash
python3 scripts/test-release-policy.py
python3 scripts/test-release-gate.py
python3 scripts/test-release-workflow.py
python3 scripts/test-dependency-exception-policy.py
```

Ce dry-run exécute le vrai script shell et le vrai moteur avec des doubles
locaux de `git` et `gh` ; il prouve l'absence de token, réseau,
authentification registre et commande de publication. Il ne prétend pas
publier ni attester une image : ces effets exigent le job protégé et un GO
séparé, ni ne remplace l'autorisation requise pour créer les réglages
distants.
