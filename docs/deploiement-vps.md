# Documentation de Déploiement — Sentinel Fullstack
## Production sur VPS · `sentinel.akiksystems.fr`

---

## 1. Contexte et Architecture

### Infrastructure existante avant déploiement

Contexte type de ce déploiement (un VPS qui héberge déjà un autre service) :

- **VPS** sous Linux, avec une IP publique et un domaine dédié à Sentinel.
- **Nginx** déjà en place sur l'hôte comme reverse proxy pour un autre site.
- **Un service applicatif voisin** tourne déjà sur l'hôte (géré par un gestionnaire
  de process type PM2). Sentinel doit cohabiter sans perturber l'existant.
- **Docker** et **Docker Compose v2** déjà installés.

### Stack Sentinel

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Base de données | PostgreSQL |
| Conteneurisation | Docker + Docker Compose |
| Reverse proxy | Nginx (existant sur le VPS) |
| SSL | Let's Encrypt via Certbot |
| Reverse proxy interne | Caddy (dans le repo — **désactivé** en prod) |

### Architecture réseau finale

```
Internet (HTTPS :443)
        │
      Nginx
        │
   ┌────┴────┐
   │         │
/api/*    /*  (tout le reste)
   │         │
Backend   Frontend
127.0.0.1  127.0.0.1
  :3001      :8080
   │
Express (Docker)
   │
PostgreSQL (Docker)
```

---

## 2. Préparation du Serveur

### 2.1 Vérification de l'existant

Avant de déployer, on audite tous les utilisateurs et répertoires :

```bash
ls /var/www/          # sites existants
ps aux | grep node    # processus Node en cours
pm2 list              # services PM2 actifs
docker ps             # conteneurs Docker actifs
```

> **Règle d'or :** Ne jamais toucher au service existant qui tourne en parallèle sur l'hôte.

### 2.2 Clonage du projet

```bash
cd /var/www
git clone https://github.com/AmineAKIK/sentinel-fullstack sentinel
cd sentinel
```

---

## 3. Configuration des Variables d'Environnement

### 3.1 Création du fichier `.env`

Le `.env` ne doit **jamais** être dans git. Il se crée manuellement sur le serveur :

```bash
nano /var/www/sentinel/.env
```

### 3.2 Contenu complet du `.env` de production

```env
NODE_ENV=production

# Domaine
CADDY_DOMAIN=sentinel.akiksystems.fr
CLIENT_ORIGIN=https://sentinel.akiksystems.fr
VITE_API_URL=https://sentinel.akiksystems.fr

# Base de données
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=<mot_de_passe_fort>
DATABASE_URL=postgresql://sentinel:<mot_de_passe_fort>@postgres:5432/sentinel

# Compte admin (MINIMUM 24 caractères obligatoire)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<minimum_24_caracteres>

# Secrets cryptographiques (générer avec openssl rand -hex 32)
COOKIE_SECRET=<64_chars_hex>
JWT_SECRET=<64_chars_hex>

# Code d'accès au tableau (SHA256 du code choisi)
BOARD_ACCESS_CODE_HASH=<sha256_du_code>

# Proxy et session
TRUST_PROXY=true
BOARD_ACCESS_LABEL=Board atelier
BOARD_SESSION_TTL_HOURS=12

# Journalisation (optionnel : trace|debug|info|warn|error|fatal, défaut info)
LOG_LEVEL=info

# Rate-limit global de l'API (optionnel — surcharge les défauts du code).
# Compte TOUTES les requêtes par IP ; pensé pour laisser de la marge à plusieurs
# postes derrière une même IP publique. Laisser vide pour garder les défauts
# (3000 requêtes / 15 min). Le rate-limit de connexion, lui, n'est pas
# configurable (10 échecs / 5 min, codé en dur).
GLOBAL_API_RATE_LIMIT_MAX=3000
GLOBAL_API_RATE_LIMIT_WINDOW_MS=900000

# IA (optionnel)
DEEPSEEK_API_KEY=<ta_clé>
```

### 3.3 Génération des secrets

```bash
# Cookie secret et JWT secret (lancer 2 fois, un pour chaque)
openssl rand -hex 32

# Hash du code d'accès tableau (remplacer VOTRE_CODE_BOARD par le code choisi)
echo -n "VOTRE_CODE_BOARD" | sha256sum | awk '{print $1}'
# → d9e39f2a3602f36483ff754ca69f825897020834e764412d30f055637dbaff14 (exemple)
```

### 3.4 Règles de validation du backend

Le backend en production refuse de démarrer si :

- `ADMIN_PASSWORD` fait moins de **24 caractères**
- `BOARD_ACCESS_CODE_HASH` n'est pas exactement **64 caractères hexadécimaux** (SHA256 valide)
- `COOKIE_SECRET` ou `JWT_SECRET` sont trop courts

---

## 4. Configuration Docker Compose

### 4.1 Pourquoi un fichier override

Le `docker-compose.yml` du repo inclut **Caddy** comme reverse proxy interne qui écoute sur les ports 80 et 443. En production avec Nginx déjà en place, Caddy crée un conflit de ports.

**Principe :** Ne jamais modifier `docker-compose.yml` (fichier du repo). Utiliser un `docker-compose.override.yml` qui est lu automatiquement par Docker Compose et fusionne sa configuration par-dessus le fichier principal.

### 4.2 `/var/www/sentinel/docker-compose.override.yml`

```yaml
services:
  backend:
    ports:
      - "127.0.0.1:3001:3000"   # backend exposé uniquement en local

  frontend:
    ports:
      - "127.0.0.1:8080:80"     # frontend exposé uniquement en local
    build:
      args:
        VITE_API_URL: https://sentinel.akiksystems.fr

  caddy:
    profiles:
      - disabled                 # désactive Caddy complètement
```

**Points importants :**

- `127.0.0.1:3001:3000` → le backend Docker (port interne 3000) est accessible depuis le VPS sur le port 3001, mais **pas depuis l'extérieur**
- `127.0.0.1:8080:80` → idem pour le frontend
- `profiles: [disabled]` → Caddy ne démarre jamais car ce profil n'est jamais activé

---

## 5. Build du Frontend — injection de `VITE_API_URL`

`VITE_API_URL` est une variable Vite : elle est **compilée dans le bundle** au
moment du `docker build`, pas lue au runtime. Le [`frontend/Dockerfile`](frontend/Dockerfile)
l'injecte via un `ARG` placé juste avant `RUN npm run build`, ce qui suffit pour
que Vite la voie :

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:3000   # disponible pour le build ci-dessous
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

La valeur est passée au build par le `docker-compose.override.yml`
(`build.args.VITE_API_URL`, voir section 4).

> **Conséquence pratique :** si on change `VITE_API_URL`, un `restart` ne suffit
> pas — il faut **rebuilder** le frontend (`docker compose build --no-cache frontend`,
> puis `up -d`). Le cache Docker peut aussi réutiliser une ancienne couche : en cas
> de doute, `docker builder prune -f` avant le rebuild.

---

## 6. Valeur de `VITE_API_URL` — éviter le double `/api`

### 6.1 Le piège

Le fichier [`frontend/src/api/client.ts`](frontend/src/api/client.ts) construit
les URLs en préfixant déjà les chemins par `/api` :

```typescript
fetch(`${API_URL}/api/auth/login`)
fetch(`${API_URL}/api/board/session`)
```

Donc si `VITE_API_URL` contient déjà `/api` à la fin
(`https://sentinel.akiksystems.fr/api`), l'URL finale devient :

```
https://sentinel.akiksystems.fr/api/api/auth/login  → 404
```

### 6.2 La règle

`VITE_API_URL` doit être l'origine **sans `/api`** :
`https://sentinel.akiksystems.fr`. C'est le seul réglage nécessaire — aucune
modification de `client.ts` n'est requise.

> La ligne `const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';`
> dans `client.ts` est correcte telle quelle : le cast TypeScript est purement
> statique (effacé à la compilation) et n'affecte ni le build Vite ni le runtime.

---

## 7. Configuration Nginx

### 7.1 Création du vhost

```bash
sudo nano /etc/nginx/sites-available/sentinel
```

### 7.2 Contenu du fichier

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sentinel.akiksystems.fr;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name sentinel.akiksystems.fr;

    ssl_certificate /etc/letsencrypt/live/sentinel.akiksystems.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sentinel.akiksystems.fr/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # API → backend Express (Docker)
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Tout le reste → frontend React (Docker nginx)
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 7.3 Activation du vhost

```bash
sudo ln -s /etc/nginx/sites-available/sentinel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7.4 Pourquoi `TRUST_PROXY=true`

Nginx est devant Express. Express voit les requêtes venir de `127.0.0.1` (Nginx), pas du vrai client. `TRUST_PROXY=true` indique à Express de faire confiance aux headers `X-Forwarded-For` et `X-Forwarded-Proto` injectés par Nginx pour connaître la vraie IP et le vrai protocole.

---

## 8. SSL avec Let's Encrypt

### 8.1 Prérequis

Le DNS `sentinel.akiksystems.fr` doit pointer vers `<IP_DU_VPS>` **avant** de lancer Certbot.

```bash
# Vérification de la propagation DNS
nslookup sentinel.akiksystems.fr
```

### 8.2 Obtention du certificat

```bash
sudo certbot --nginx -d sentinel.akiksystems.fr
```

Certbot :
1. Vérifie que le domaine pointe vers le serveur
2. Génère le certificat dans `/etc/letsencrypt/live/sentinel.akiksystems.fr/`
3. Modifie automatiquement la config Nginx

> **Attention :** Certbot peut corrompre la config Nginx en ajoutant des blocs en double. Toujours vérifier avec `sudo nginx -t` après et réécrire le fichier si nécessaire.

### 8.3 Renouvellement automatique

Certbot installe un cron automatique. Pour tester :

```bash
sudo certbot renew --dry-run
```

---

## 9. Déploiement — Commandes

### 9.1 Premier déploiement

```bash
cd /var/www/sentinel

# 1. Créer le .env (voir section 3)
nano .env

# 2. Créer le docker-compose.override.yml (voir section 4)
nano docker-compose.override.yml

# 3. Build et démarrage
docker compose build --no-cache
docker compose up -d

# 4. Vérifier que tout est healthy
docker compose ps
```

### 9.2 Mise à jour après un push GitHub

```bash
cd /var/www/sentinel
docker compose down
git pull
docker builder prune -f
docker compose build --no-cache frontend
docker compose up -d
```

### 9.3 Vérification post-déploiement

```bash
# Statut des conteneurs
docker compose ps

# Logs en temps réel
docker compose logs -f backend
docker compose logs -f frontend

# Test health check
curl -s https://sentinel.akiksystems.fr/api/health
# → {"status":"ok","db":"ok"}

# Test accès tableau
curl -X POST https://sentinel.akiksystems.fr/api/board/session \
  -H "Content-Type: application/json" \
  -d '{"code":"VOTRE_CODE_BOARD"}'
# → {"access":true,"label":"Board atelier","expiresInHours":12}
```

---

## 10. Structure des Routes Backend

Les routes Express sont toutes montées sous le préfixe `/api` :

```
GET  /api/health             → health check (DB inclus)
POST /api/auth/login         → connexion admin
POST /api/auth/logout        → déconnexion
GET  /api/admin/*            → dashboard admin (protégé JWT)
POST /api/board/session      → accès tableau avec code
GET  /api/workshop/*         → gestion atelier
```

---

## 11. Problèmes Rencontrés et Solutions

### Problème 1 — Backend ne démarre pas : mot de passe trop court

**Symptôme :** Container backend en état `Exited` immédiatement après le démarrage.  
**Cause :** `ADMIN_PASSWORD` de moins de 24 caractères. Le backend impose `MIN_SECRET_LENGTH=24` en production.  
**Solution :** Utiliser un mot de passe d'au moins 24 caractères dans le `.env`.

---

### Problème 2 — BOARD_ACCESS_CODE_HASH invalide

**Symptôme :** Backend refusait de démarrer avec une erreur sur le hash.  
**Cause :** La valeur fournie n'était pas un SHA256 valide (doit être exactement 64 caractères hex).  
**Solution :**

```bash
echo -n "VOTRE_CODE_BOARD" | sha256sum | awk '{print $1}'
# Résultat à coller dans BOARD_ACCESS_CODE_HASH
```

---

### Problème 3 — Caddy en conflit avec Nginx

**Symptôme :** `docker compose up` échouait avec une erreur de bind sur les ports 80/443.  
**Cause :** Le `docker-compose.yml` du repo démarre Caddy qui tente de prendre les ports 80 et 443, déjà occupés par Nginx.  
**Solution :** `docker-compose.override.yml` avec `profiles: [disabled]` sur le service Caddy.

---

### Problème 4 — `VITE_API_URL` mal prise en compte au build

**Symptôme :** Le frontend compilé pointait sur la mauvaise URL d'API (encore
`localhost:3000`, ou double `/api` provoquant des 404).  
**Causes :**
1. **Cache Docker** réutilisant une ancienne couche de build où `VITE_API_URL`
   valait encore la valeur par défaut.
2. **Valeur avec `/api` en fin** (`https://sentinel.akiksystems.fr/api`) →
   double `/api` dans les URLs, puisque `client.ts` préfixe déjà les chemins par
   `/api` (voir section 6).

**Solution :** mettre `VITE_API_URL=https://sentinel.akiksystems.fr` (sans `/api`)
dans le `.env`/override, puis rebuild propre :
`docker builder prune -f` puis `docker compose build --no-cache frontend`.

---

### Problème 5 — Nginx affichait "Welcome to nginx"

**Symptôme :** Le site affichait la page par défaut Nginx au lieu de Sentinel.  
**Cause :** Le symlink `/etc/nginx/sites-enabled/sentinel` pointait vers une config incorrecte ou corrompue par Certbot.  
**Solution :** Réécrire le fichier config avec `sudo tee`, tester avec `nginx -t`, recharger.

---

### Problème 6 — 404 en navigateur, curl fonctionnait

**Symptôme :** `curl https://sentinel.akiksystems.fr/api/auth/login` → 400 (correct), mais le navigateur recevait 404.  
**Cause :** Double `/api` dans l'URL construite par le frontend. DevTools montrait clairement `/api/api/auth/login` dans le path.  
**Indicateur clé :** La réponse 404 contenait `X-Powered-By: Express` → c'était bien Express qui répondait 404, pas Nginx. Le problème était donc dans le code frontend, pas dans l'infra.

---

## 12. Commandes de Maintenance

```bash
# Logs d'un service spécifique
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Redémarrer un seul service sans rebuild
docker compose restart backend

# Shell dans un conteneur
docker exec -it sentinel_backend sh
docker exec -it sentinel_postgres psql -U sentinel -d sentinel

# Vérifier la config Nginx
sudo nginx -t
sudo systemctl reload nginx

# Voir l'état des certificats SSL
sudo certbot certificates

# Voir ce qui écoute sur les ports
sudo ss -tlnp | grep -E '80|443|3001|8080'
```

---

## 13. Checklist de Déploiement

- [ ] DNS `sentinel.akiksystems.fr` → `<IP_DU_VPS>` propagé
- [ ] `.env` créé sur le serveur avec toutes les variables
- [ ] `ADMIN_PASSWORD` ≥ 24 caractères
- [ ] `BOARD_ACCESS_CODE_HASH` = SHA256(code) — 64 hex chars
- [ ] `COOKIE_SECRET` et `JWT_SECRET` générés avec `openssl rand -hex 32`
- [ ] `VITE_API_URL=https://sentinel.akiksystems.fr` (sans `/api`)
- [ ] `docker-compose.override.yml` créé avec Caddy désactivé
- [ ] Certificat SSL obtenu via Certbot
- [ ] Config Nginx créée et symlink activé dans `sites-enabled`
- [ ] `nginx -t` passe sans erreur
- [ ] `docker compose ps` → tous les services `Healthy`
- [ ] `curl https://sentinel.akiksystems.fr/api/health` → `{"status":"ok","db":"ok"}`
- [ ] Login admin fonctionnel dans le navigateur
- [ ] Accès tableau board fonctionnel dans le navigateur
