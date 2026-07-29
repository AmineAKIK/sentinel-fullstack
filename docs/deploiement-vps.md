# Déploiement VPS de Sentinel

Ce document décrit **deux topologies de déploiement**, sans les mélanger :

- **Topologie A — distribution autonome (Caddy intégré).** Le Compose racine
  fournit Caddy comme unique point d'entrée TLS. Les seuls ports publiés sont
  `80`/`443`. Aucun proxy hôte n'est requis.
- **Topologie B — frontal Nginx hôte (l'instance publique
  `sentinel.akiksystems.fr`).** Le VPS possède déjà son Nginx ; Caddy ne démarre
  pas. Les services applicatifs sont publiés **uniquement sur `127.0.0.1`** via
  `docker-compose.host-proxy.example.yml`, et le Nginx hôte termine le TLS.

Ce guide documente **la topologie B pour l'instance publique**, déployée par
image de registry épinglée par digest. La topologie A est décrite en annexe
(section 10) pour une distribution autonome.

### Observation publique en lecture seule du 30 juillet 2026

Le bord observable confirme la topologie B : le DNS A de
`sentinel.akiksystems.fr` vaut `79.137.34.84`, les ports publics 80 et 443
répondent avec `Server: nginx`, et HTTP redirige vers HTTPS. Le certificat TLS
couvre exactement le domaine, HSTS et les en-têtes publics attendus sont
présents, et `/api/health` répond HTTP 200 avec la version
`da97e5222e0978d9e4af08afe70a08d49a80f4de`. Cette version est encore celle de
la RC4 publiée : cette observation n'est ni un déploiement ni une preuve RC5.

Ces faits prouvent le frontal public Nginx et excluent Caddy intégré comme
terminaison TLS publique. Aucun accès SSH nominatif n'étant disponible lors de
la lecture, ils ne prouvent pas les fichiers Compose actifs, conteneurs,
digests, binds loopback, version Nginx ou sortie `nginx -T` internes. Les trois
fichiers ci-dessous restent le contrat normatif de la topologie B; leur état
effectif devra être relu lors d'une recette VPS autorisée.

Toutes les commandes s'exécutent depuis le répertoire de déploiement. Pour
l'instance publique il est fixe ; on le référence par `SENTINEL_DIR`, et la
topologie B se compose **toujours** des trois mêmes fichiers Compose, regroupés
dans `COMPOSE` et réutilisés à l'identique par chaque commande :

```bash
export SENTINEL_DIR=/var/www/sentinel
cd "$SENTINEL_DIR"
# Tag de la release réellement déployée (ex. v1.0.0-rc.1, v1.0.0…). Toutes les
# commandes en dérivent : jamais de tag ni de SHA codé en dur. Renseigner
# explicitement AVANT de continuer ; le laisser vide interrompt les commandes.
export RELEASE_TAG=""   # p. ex. : export RELEASE_TAG=v1.0.0
: "${RELEASE_TAG:?définir RELEASE_TAG (le tag de la release à déployer)}"
# base + override host-proxy (Nginx hôte) + registry (images par digest)
COMPOSE=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.registry.yml)
```

## 1. Architectures de déploiement

Topologie A — distribution autonome :

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

Topologie B — instance publique :

```text
Internet -> Nginx hôte :443 -> 127.0.0.1:<port_frontend> -> frontend/Nginx :8080
                         \-> 127.0.0.1:<port_backend> -> API Node :3000 -> PostgreSQL
```

Les deux ports loopback (`SENTINEL_FRONTEND_BIND_PORT`,
`SENTINEL_BACKEND_BIND_PORT`) sont choisis par l'exploitant et reportés à
l'identique dans le vhost Nginx ; ils ne sont publiés que sur `127.0.0.1`.

- en topologie A, `caddy` appartient aux réseaux `edge` et `internal` ;
- `postgres` appartient uniquement au réseau isolé `internal` et n'est jamais
  publié sur l'hôte ;
- `frontend` appartient à `internal` ; dans la topologie B
  (`docker-compose.host-proxy.example.yml`), il rejoint aussi `edge` pour que sa
  publication sur le loopback fonctionne (sans quoi le port n'est pas
  réellement exposé) ;
- `backend` appartient aussi à `edge` pour joindre les fournisseurs SMTP et IA ;
- seuls les ports `80` et `443` sont exposés publiquement ; la topologie B
  publie en plus deux binds privés sur `127.0.0.1` ;
- les conteneurs applicatifs ont un système de fichiers en lecture seule, un
  `/tmp` borné et aucune capability Linux ;
- les images et runtimes sont épinglés dans les Dockerfiles et le Compose.

## 2. Prérequis

- un VPS Linux maintenu avec Docker Engine et Docker Compose v2 ;
- un domaine dont les enregistrements A/AAAA pointent vers le VPS ;
- les ports entrants TCP 80 et 443 ouverts ;
- un accès SSH nominatif par clé ;
- un stockage hors site pour les sauvegardes PostgreSQL.

Contrôles initiaux :

```bash
docker --version
docker compose version
ss -ltnp | grep -E ':(80|443)\b' || true
```

Pour la distribution autonome, arrêter ou reconfigurer tout Apache, Nginx ou
Caddy de l'hôte qui utiliserait déjà 80/443. Pour un VPS mutualisant son Nginx,
suivre la variante décrite à la section 2.1.

### 2.1 Frontal Nginx hôte (topologie B)

Copier l'override d'exemple, choisir deux ports loopback libres et adapter le
virtual host Nginx à partir de `deploy/nginx/sentinel.conf.example` :

```bash
cd "$SENTINEL_DIR"
cp docker-compose.host-proxy.example.yml docker-compose.override.yml
```

Les deux ports de publication loopback (`SENTINEL_BACKEND_BIND_PORT`,
`SENTINEL_FRONTEND_BIND_PORT`) sont **persistés dans le `.env`** (voir §4), jamais
laissés à de simples `export` de session. Le profil `bundled-edge` n'est pas
activé : Caddy ne démarre pas. Les ports applicatifs sont publiés **sur
`127.0.0.1` uniquement** — jamais ouverts dans le pare-feu public. Le Nginx hôte
termine le TLS, redirige HTTP et transmet `Host`, `X-Real-IP`, `X-Forwarded-For`
et `X-Forwarded-Proto`. Le déploiement lui-même (build/pull, démarrage) est
décrit à la section 6, procédure unique par image de registry.

## 3. Installation

```bash
export SENTINEL_DIR=/var/www/sentinel
sudo install -d -o "$USER" -g "$USER" "$SENTINEL_DIR"
git clone <URL_DU_DEPOT> "$SENTINEL_DIR"
cd "$SENTINEL_DIR"
cp .env.release.example .env
chmod 600 .env
```

Ne jamais versionner `.env`. Toutes les valeurs `replace_with_...` doivent être
remplacées avant le premier démarrage. `BUILD_SHA` est **persisté dans le `.env`**
(voir §4), pas exporté en session : après une reconnexion SSH, un `export`
perdu ferait échouer le préflight et le démarrage.

## 4. Configuration

### Domaine et origine

```dotenv
CADDY_DOMAIN=sentinel.example.com
CLIENT_ORIGIN=https://sentinel.example.com
VITE_API_URL=
TRUST_PROXY=true
```

`CLIENT_ORIGIN` est une origine HTTPS exacte, sans chemin ni slash final.
`VITE_API_URL` reste vide : le navigateur appelle `/api` sur la même origine et
le proxy retenu route ces requêtes vers le backend.

`BUILD_SHA` doit contenir les 40 caractères de `git rev-parse HEAD`. Le backend
refuse une valeur absente ou symbolique et la publie dans `/api/health` pour
permettre une comparaison exacte après déploiement.

### PostgreSQL

```dotenv
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=<mot_de_passe_aleatoire_long>
DATABASE_URL=postgres://sentinel:<mot_de_passe_encode_si_necessaire>@postgres:5432/sentinel
```

Si le mot de passe contient des caractères réservés dans une URL (`@`, `:`, `/`,
`?`, `#`), les encoder dans `DATABASE_URL` ou générer une valeur hexadécimale.

### Secrets de session

Générer deux valeurs différentes :

```bash
openssl rand -hex 32
openssl rand -hex 32
```

```dotenv
COOKIE_SECRET=<premiere_valeur>
JWT_SECRET=<seconde_valeur>
```

Le backend refuse les valeurs absentes, trop courtes ou connues comme valeurs de
démonstration.

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
4. recréer le backend **sans reconstruction locale**, avec la composition
   complète de la topologie B (voir §6.1 pour `COMPOSE`) :

   ```bash
   docker compose "${COMPOSE[@]}" up -d --no-build --force-recreate backend
   ```

Les redémarrages suivants utilisent l'admin stocké en base. Sentinel impose un
seul compte administrateur au niveau SQL.

### Code Board

Le code n'est jamais stocké en clair ni en SHA-256. Générer un hash **bcrypt** :

```bash
cd backend
npm ci
BOARD_ACCESS_CODE='code-temporaire-du-board' npm run hash:board
cd ..
```

Reporter la sortie complète `$2b$...` **entre quotes simples** : Docker Compose
interpolerait les `$` non quotés du `.env` et tronquerait le hash, alors qu'une
valeur entre quotes simples est prise littéralement — le conteneur reçoit le
bcrypt exact (60 caractères, commençant par `$2b$`, sans quote résiduelle).

```dotenv
# hash généré : $2b$10$abcdef...
BOARD_ACCESS_CODE_HASH='$2b$10$abcdef...'
```

Le libellé et la durée de session Board sont stockés en base et administrables
depuis l'interface. Le hash d'environnement reste le bootstrap initial du code.

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
```

L'outbox persistante limite les pertes lors d'une indisponibilité SMTP :

```dotenv
NOTIFICATION_BATCH_SIZE=10
NOTIFICATION_MAX_ATTEMPTS=5
NOTIFICATION_POLL_INTERVAL_MS=5000
```

## 5. Préflight avant bascule

Le préflight **ne stoppe, ne remplace et ne reconfigure aucun service en
cours**, et ne modifie aucun fichier du dépôt (jamais le `.env`). Il **peut
récupérer les images candidates** et **lance un conteneur backend éphémère**,
sans dépendances, afin d'exécuter la garde de configuration de production. Il
n'affiche aucune valeur de secret ; le SHA et les références d'images ne sont
pas des secrets et peuvent apparaître.

Parce que le préflight confronte le **digest déployé au `BUILD_SHA` attendu**
(voir plus bas), **les images doivent déjà être présentes localement** : on
exécute donc le `pull` **avant** le préflight. Le pull ne remplace aucun
conteneur en cours.

```bash
cd "$SENTINEL_DIR"   # répertoire de déploiement, p. ex. /var/www/sentinel
# 1) pull non destructif des images par digest (aucun conteneur remplacé)
docker compose "${COMPOSE[@]}" pull
# 2) préflight sur la MÊME composition, avec le .env du déploiement
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"
```

Il refuse : une variable obligatoire manquante, un secret resté placeholder, un
secret trop court, un `BUILD_SHA` non conforme, un `BOARD_ACCESS_CODE_HASH` qui
n'est pas un bcrypt valide tel que le conteneur le recevra (un hash nu, sans
quotes simples, est tronqué par l'interpolation ; un ancien hash SHA-256 est
rejeté), une image sans digest, **un digest dont l'image ne correspond pas au
`BUILD_SHA` attendu** (label OCI `org.opencontainers.image.revision` et
`BUILD_SHA` runtime du backend), une publication hors loopback ou un PostgreSQL
exposé. Ne jamais déployer tant qu'un contrôle échoue.

**Ordre de déploiement à respecter :**

1. **sauvegarde** (`./scripts/backup.sh`) ;
2. **pull** non destructif des images par digest ;
3. **préflight** (`./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"`) — corriger avant d'aller plus loin ;
4. **déploiement** (`up -d --no-build`) ;
5. **health** (`/api/health.version` == SHA du tag) ;
6. **recette** courte Admin/Atelier/Board.

Les valeurs de release (`BUILD_SHA`, digests d'images) doivent être **persistées
de façon maîtrisée** — dans le `.env` du déploiement et le procès-verbal de
recette — jamais laissées à de simples `export` de session comme procédure
officielle.

## 6. Déploiement d'une release (topologie B, procédure unique)

L'instance publique déploie **une image de registry épinglée par digest**,
jamais une reconstruction locale : le VPS exécute exactement l'image construite
et vérifiée en CI. Les deux digests figurent dans les notes de la release
GitHub. La même procédure vaut pour le premier démarrage et pour chaque mise à
jour de version.

### 6.1 Renseigner les valeurs de release dans le `.env`

Les valeurs de release sont **persistées dans le `.env`** (mode `600`), jamais
laissées à des `export` de session. Ajouter/mettre à jour, en plus des secrets
de la section 4 :

```dotenv
# SHA git complet du commit de la release. À DÉRIVER du tag réellement déployé,
# jamais codé en dur : BUILD_SHA=$(git rev-parse <tag>^{commit})
BUILD_SHA=<sha_git_40_hex_du_tag>
# Images épinglées par digest (depuis les notes de la release)
SENTINEL_BACKEND_IMAGE=ghcr.io/amineakik/sentinel-fullstack/backend@sha256:...
SENTINEL_FRONTEND_IMAGE=ghcr.io/amineakik/sentinel-fullstack/frontend@sha256:...
# Ports de publication loopback (topologie B). Ces valeurs sont des PLACEHOLDERS :
# choisir les ports loopback réels de l'hôte et les reporter à l'identique dans
# le vhost Nginx (proxy_pass 127.0.0.1:<port>). Ils ne sont jamais publiés
# publiquement, seulement sur le loopback.
SENTINEL_BACKEND_BIND_PORT=<port_backend_loopback>
SENTINEL_FRONTEND_BIND_PORT=<port_frontend_loopback>
```

Aligner le code sur le tag (migrations, exemples) sans dépendre de son `.env`
suivi :

```bash
cd "$SENTINEL_DIR"
git fetch --tags origin
git checkout "$RELEASE_TAG"
cp docker-compose.registry.example.yml docker-compose.registry.yml
```

Les trois fichiers Compose de la topologie B (**base + override host-proxy +
registry**) sont regroupés dans `COMPOSE`, défini en tête de ce guide. Le
rappel :

```bash
COMPOSE=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.registry.yml)
```

### 6.2 Sauvegarde → pull → préflight → déploiement → health → recette

Le pull précède le préflight : ce dernier confronte le digest déployé au
`BUILD_SHA` attendu (label OCI + SHA runtime), ce qui exige les images présentes
localement. Le pull ne remplace aucun conteneur en cours.

```bash
# 1. sauvegarde
./scripts/backup.sh

# 2. pull des images par digest (docker login ghcr.io d'abord si packages privés)
#    non destructif : aucun conteneur en cours n'est remplacé
docker compose "${COMPOSE[@]}" pull backend frontend

# 3. préflight (ne stoppe/remplace aucun service ; lit le .env du déploiement)
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"

# 4. déploiement sans reconstruction locale
docker compose "${COMPOSE[@]}" up -d --no-build --remove-orphans
docker compose "${COMPOSE[@]}" ps

# 5. health
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
```

Le backend applique les migrations sous verrou PostgreSQL avant d'écouter ; il
refuse une migration déjà appliquée au checksum modifié ou un historique
référençant un fichier absent. Réponse santé attendue :

```json
{"status":"ok","db":"ok","version":"<sha_git_40_caracteres>"}
```

`version` doit égaler `git rev-parse "$RELEASE_TAG^{commit}"`, et le digest de
l'image backend déployée doit correspondre à `SENTINEL_BACKEND_IMAGE`. Consigner les deux
digests dans le procès-verbal de recette (REL-03).

### 6.3 Recette

Contrôler les trois accès depuis un navigateur : portail, Board et connexion
Atelier. Les données Board ne doivent pas être accessibles sans leur session
dédiée. Détail des cas dans la [checklist de recette](#9-checklist-de-recette).

**Ne jamais `docker compose down` pour une mise à jour normale** : `up -d` suffit
à recréer uniquement les conteneurs dont l'image ou la configuration a changé.
Ne supprimer ni le volume `sentinel_data` ni les volumes Caddy. Conserver le
backup hors du VPS. En cas de problème, voir le retour arrière du
[runbook](runbook.md) (redéploiement du digest précédent).

## 7. Sauvegarde et restauration

Le script de backup utilise le service Compose `postgres`, produit un fichier
temporaire puis le renomme après vérification gzip. Un checksum SHA-256 protège
le **fichier de sauvegarde** contre la corruption : cela est indépendant du hash
bcrypt du code Board.

```bash
./scripts/backup.sh --keep 30
./scripts/restore.sh backups/sentinel_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
```

La restauration :

1. vérifie gzip et le checksum associé ;
2. importe dans une base temporaire en transaction ;
3. valide les tables structurantes Sentinel ;
4. arrête brièvement le backend ;
5. bascule les noms de base puis redémarre le backend.

Voir [runbook.md](runbook.md) pour le cron, la copie hors site et le retour
arrière.

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

## 9. Checklist de recette

### Commune aux deux topologies

- [ ] DNS correct et certificat TLS valide
- [ ] préflight (`./scripts/preflight.sh …`) passé sans échec
- [ ] tous les placeholders supprimés de `.env` (mode `600`)
- [ ] secrets Cookie/JWT distincts et aléatoires
- [ ] code Board représenté par un hash bcrypt `$2...`, entre quotes simples
- [ ] `BUILD_SHA` et digests d'images persistés dans `.env`
- [ ] admin initial connecté, mot de passe changé, variables bootstrap retirées
- [ ] `/api/health` renvoie HTTP 200 ; `version` == SHA du tag déployé
- [ ] digests des images déployées == ceux de la release (REL-03)
- [ ] `postgres` jamais publié sur l'hôte (aucun port 5432 exposé)
- [ ] parcours Admin, Atelier et Board validés
- [ ] backup créé, copié hors site et checksum vérifié
- [ ] procédure de restauration testée hors production

### Topologie A — distribution autonome (Caddy intégré)

- [ ] service `caddy` actif ; seuls les ports `80`/`443` publiés
- [ ] aucun port applicatif (`3000`, `8080`) publié sur l'hôte

### Topologie B — frontal Nginx hôte (instance publique)

- [ ] service `caddy` **absent** (profil `bundled-edge` non activé)
- [ ] `backend` et `frontend` publiés **uniquement** sur `127.0.0.1`
      (`SENTINEL_BACKEND_BIND_PORT`, `SENTINEL_FRONTEND_BIND_PORT`)
- [ ] aucun de ces ports loopback n'est ouvert dans le pare-feu public
- [ ] Nginx hôte termine le TLS et transmet les en-têtes `X-Forwarded-*`

## 10. Annexe — Topologie A (distribution autonome, Caddy intégré)

Pour un VPS dédié sans proxy hôte, la distribution autonome utilise **le seul
fichier `docker-compose.yml`** : Caddy termine le TLS et publie `80`/`443`. Le
`.env` porte les mêmes secrets (section 4) et `BUILD_SHA` ; on peut y déployer
soit une image de registry (comme en topologie B, sans l'override host-proxy),
soit une construction locale.

Déploiement par image de registry (recommandé) — même ordre qu'en topologie B,
`sauvegarde → pull → préflight → up → health`, le préflight exigeant les images
déjà présentes localement :

```bash
cd "$SENTINEL_DIR"
cp docker-compose.registry.example.yml docker-compose.registry.yml
COMPOSE=(-f docker-compose.yml -f docker-compose.registry.yml)
./scripts/backup.sh
docker compose "${COMPOSE[@]}" pull backend frontend
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"
docker compose "${COMPOSE[@]}" up -d --no-build --remove-orphans
curl --fail --show-error https://sentinel.example.com/api/health
```

Construction locale (si l'on ne consomme pas le registry) : `docker compose -f
docker-compose.yml build backend frontend` puis `docker compose -f
docker-compose.yml up -d --remove-orphans`. **Le préflight de release ne
s'applique pas à ce mode** : il certifie une release de registry et exige un
digest complet pour backend et frontend ; une composition sans digest est
refusée. La construction locale vise le développement/la démo, pas une release
certifiée. Comme en topologie B, ne jamais utiliser `docker compose down` pour
une mise à jour normale.
