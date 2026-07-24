# Déploiement VPS de Sentinel

Ce document décrit les deux topologies de déploiement maintenues. Le Compose
racine fournit une distribution autonome où Caddy est l'unique point d'entrée.
L'instance publique `sentinel.akiksystems.fr` conserve le Nginx déjà présent sur
le VPS et utilise l'override assaini `docker-compose.host-proxy.example.yml`.

## 1. Architecture de production

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

Variante de l'instance publique :

```text
Internet -> Nginx hôte :443 -> 127.0.0.1:18080 -> frontend/Nginx :8080
                         \-> 127.0.0.1:13000 -> API Node :3000 -> PostgreSQL
```

- `caddy` appartient aux réseaux `edge` et `internal` ;
- `postgres` appartient uniquement au réseau isolé `internal` et n'est jamais
  publié sur l'hôte ;
- `frontend` appartient à `internal` ; dans la variante frontal-hôte
  (`docker-compose.host-proxy.example.yml`), il rejoint aussi `edge` pour que sa
  publication sur le loopback fonctionne (sans quoi le port n'est pas
  réellement exposé) ;
- `backend` appartient aussi à `edge` pour joindre les fournisseurs SMTP et IA ;
- seuls les ports `80` et `443` sont publiés sur l'hôte ;
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

### 2.1 Variante avec Nginx hôte

Copier l'override d'exemple vers un fichier local ignoré, choisir deux ports
loopback libres et adapter le virtual host Nginx à partir de
`deploy/nginx/sentinel.conf.example` :

```bash
cp docker-compose.host-proxy.example.yml docker-compose.override.yml
export SENTINEL_BACKEND_BIND_PORT=13000
export SENTINEL_FRONTEND_BIND_PORT=18080
export BUILD_SHA="$(git rev-parse HEAD)"
docker compose config --quiet
docker compose up -d --build --remove-orphans
```

Dans cette variante, le profil `bundled-edge` n'est pas activé : Caddy ne
démarre pas. Les ports applicatifs sont liés à `127.0.0.1` et ne doivent jamais
être ouverts dans le pare-feu public. Le Nginx hôte termine TLS, redirige HTTP et
transmet `Host`, `X-Real-IP`, `X-Forwarded-For` et `X-Forwarded-Proto`.

## 3. Installation

```bash
sudo install -d -o "$USER" -g "$USER" /opt/sentinel
git clone <URL_DU_DEPOT> /opt/sentinel
cd /opt/sentinel
cp .env.release.example .env
chmod 600 .env
export BUILD_SHA="$(git rev-parse HEAD)"
```

Ne jamais versionner `.env`. Toutes les valeurs `replace_with_...` doivent être
remplacées avant le premier démarrage.

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
4. recréer le backend avec `docker compose up -d --force-recreate backend`.

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

## 5. Préflight avant démarrage

Le préflight est **non destructif** : il vérifie les prérequis d'une release
avant tout arrêt ou remplacement de conteneur, sans jamais rien démarrer ni
arrêter. Il n'affiche aucune valeur de secret.

```bash
cd "$SENTINEL_DIR"   # répertoire de déploiement, p. ex. /var/www/sentinel
# Passer la ou les mêmes compositions que le déploiement réel :
./scripts/preflight.sh -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.registry.yml
```

Il refuse : une variable obligatoire manquante, un secret resté placeholder, un
secret trop court, un `BUILD_SHA` non conforme, un `BOARD_ACCESS_CODE_HASH` qui
n'est pas un bcrypt valide tel que le conteneur le recevra (un hash nu, sans
quotes simples, est tronqué par l'interpolation ; un ancien hash SHA-256 est
rejeté), une image sans digest, une publication hors loopback ou un PostgreSQL
exposé. Ne jamais déployer tant qu'un contrôle échoue.

**Ordre de déploiement à respecter :**

1. **sauvegarde** (`./scripts/backup.sh`) ;
2. **préflight** (`./scripts/preflight.sh …`) — corriger avant d'aller plus loin ;
3. **pull** des images par digest ;
4. **déploiement** (`up -d --no-build`) ;
5. **health** (`/api/health.version` == SHA du tag) ;
6. **recette** courte Admin/Atelier/Board.

Les valeurs de release (`BUILD_SHA`, digests d'images) doivent être **persistées
de façon maîtrisée** — dans le `.env` du déploiement et le procès-verbal de
recette — jamais laissées à de simples `export` de session comme procédure
officielle.

## 6. Premier démarrage

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=100 backend
```

Le backend applique les migrations sous verrou PostgreSQL avant d'écouter. Le
runner refuse une migration déjà appliquée dont le checksum a changé et refuse
un historique qui référence un fichier absent.

Contrôles externes :

```bash
curl --fail --show-error https://sentinel.example.com/api/health
curl --fail --show-error --head https://sentinel.example.com/login
```

Réponse santé attendue :

```json
{"status":"ok","db":"ok","version":"<sha_git_40_caracteres>"}
```

Contrôler ensuite les trois accès depuis un navigateur : portail, Board et
connexion Atelier. Les données Board ne doivent pas être accessibles sans sa
session dédiée.

## 6bis. Déploiement d'une release par image de registry (recommandé)

Pour un tag de version, préférer le déploiement des images publiées par le
workflow `Release` (GHCR) plutôt qu'une reconstruction locale : le VPS exécute
alors exactement l'image construite et vérifiée en CI, épinglée par digest
immuable. Les deux digests figurent dans les notes de la release GitHub.

```bash
cd /opt/sentinel
git fetch --tags origin
git checkout v1.0.0            # aligne le code (BUILD_SHA, migrations) sur le tag
cp docker-compose.registry.example.yml docker-compose.registry.yml
export BUILD_SHA="$(git rev-parse HEAD)"
export SENTINEL_BACKEND_IMAGE='ghcr.io/amineakik/sentinel-fullstack/backend@sha256:...'
export SENTINEL_FRONTEND_IMAGE='ghcr.io/amineakik/sentinel-fullstack/frontend@sha256:...'
echo "$GHCR_TOKEN" | docker login ghcr.io -u <utilisateur> --password-stdin   # si packages privés
docker compose -f docker-compose.yml -f docker-compose.registry.yml pull backend frontend
docker compose -f docker-compose.yml -f docker-compose.registry.yml up -d --no-build --remove-orphans
docker compose ps
```

Vérifier que la version déployée correspond exactement au tag :

```bash
curl --fail --show-error https://sentinel.example.com/api/health
docker inspect --format '{{ index .RepoDigests 0 }}' "$(docker compose -f docker-compose.yml -f docker-compose.registry.yml images -q backend)"
```

`version` dans `/api/health` doit égaler `git rev-parse v1.0.0^{commit}`, et le
digest de l'image backend doit correspondre à `SENTINEL_BACKEND_IMAGE`. Consigner
les deux digests déployés dans le procès-verbal de recette (REL-03).

## 7. Mise à jour

```bash
cd /opt/sentinel
./scripts/backup.sh
git fetch origin
git pull --ff-only origin main
docker compose config --quiet
docker compose build backend frontend
docker compose up -d --remove-orphans
docker compose ps
curl --fail --show-error https://sentinel.example.com/api/health
docker compose logs --since=10m backend frontend caddy
```

La propriété `version` retournée par la santé doit être strictement égale à
`git rev-parse HEAD` sur le serveur.

Ne supprimer ni le volume `sentinel_data`, ni les volumes Caddy lors d'une mise
à jour normale. Consulter les migrations ajoutées avant de déployer et conserver
le backup hors du VPS.

## 8. Sauvegarde et restauration

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

## 9. Sécurité d'exploitation

- limiter SSH par pare-feu et clé ;
- garder Docker, le noyau et les paquets du VPS à jour ;
- ne jamais exposer directement 3000, 5432 ou 8080 ;
- protéger `.env` avec le mode `600` ;
- utiliser des identifiants SMTP dédiés et révocables ;
- faire tourner les secrets après un départ ou un soupçon de fuite ;
- surveiller les échecs de connexion et les erreurs 5xx dans les logs ;
- tester périodiquement une restauration sur un environnement isolé ;
- conserver au moins une sauvegarde chiffrée hors site.

## 10. Checklist de recette

- [ ] DNS correct et certificat TLS valide
- [ ] `docker compose config --quiet` réussi
- [ ] tous les placeholders supprimés de `.env`
- [ ] secrets Cookie/JWT distincts et aléatoires
- [ ] code Board représenté par un hash bcrypt `$2...`
- [ ] admin initial connecté, mot de passe changé, variables bootstrap retirées
- [ ] `/api/health` renvoie HTTP 200
- [ ] services `postgres`, `backend`, `frontend` et `caddy` actifs
- [ ] aucun port 3000, 5432 ou 8080 publié
- [ ] parcours Admin, Atelier et Board validés
- [ ] backup créé, copié hors site et checksum vérifié
- [ ] procédure de restauration testée hors production
