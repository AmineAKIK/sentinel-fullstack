# Déploiement VPS de Sentinel

Ce document décrit le déploiement correspondant au `docker-compose.yml` actuel.
Il n'utilise ni proxy Nginx installé sur l'hôte, ni ports applicatifs publiés :
Caddy est l'unique point d'entrée HTTP/HTTPS.

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

- `caddy` appartient aux réseaux `edge` et `internal` ;
- `frontend` et `postgres` appartiennent uniquement au réseau isolé `internal` ;
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

Arrêter ou reconfigurer tout Apache, Nginx ou Caddy de l'hôte qui utiliserait
déjà 80/443. Le Compose Sentinel fournit son propre Caddy.

## 3. Installation

```bash
sudo install -d -o "$USER" -g "$USER" /opt/sentinel
git clone <URL_DU_DEPOT> /opt/sentinel
cd /opt/sentinel
cp .env.release.example .env
chmod 600 .env
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
Caddy route ces requêtes vers le backend.

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

Reporter la sortie complète `$2b$...` :

```dotenv
BOARD_ACCESS_LABEL=Board atelier
BOARD_SESSION_TTL_HOURS=12
BOARD_ACCESS_CODE_HASH=<hash_bcrypt>
```

Après le premier démarrage, le code et les paramètres Board peuvent être changés
depuis l'administration. Le hash d'environnement reste le bootstrap initial.

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

## 5. Validation avant démarrage

```bash
cd /opt/sentinel
docker compose config --quiet
docker compose build backend frontend
```

`docker compose config --quiet` doit échouer si une variable obligatoire manque.
Ne jamais contourner ce contrôle avec une valeur factice en production.

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
{"status":"ok","db":"ok"}
```

Contrôler ensuite les trois accès depuis un navigateur : portail, Board et
connexion Atelier. Les données Board ne doivent pas être accessibles sans sa
session dédiée.

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
