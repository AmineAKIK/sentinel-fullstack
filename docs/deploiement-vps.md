# Déploiement sur VPS

Ce guide détaille le déploiement de Sentinel sur un VPS Linux avec Docker.
Il complète [runbook.md](runbook.md) (exploitation courante) et
[release-checklist.md](release-checklist.md) (validation avant publication).

> **Contexte.** En production réelle, Sentinel est prévu pour tourner sur le
> réseau local d'un atelier. Ce guide couvre aussi un déploiement sur VPS avec
> domaine public et TLS — par exemple pour une démonstration accessible à distance.
> L'architecture (conteneurs, reverse proxy, base) reste identique dans les deux cas.

---

## 1. Vue d'ensemble

La stack est décrite dans [`docker-compose.yml`](../docker-compose.yml) et comprend
quatre services sur un réseau Docker interne (`internal`) :

| Service | Image / source | Rôle | Exposé sur l'hôte |
|---------|----------------|------|-------------------|
| `postgres` | `postgres:15-alpine` | Base de données | Non (réseau interne) |
| `backend` | build `./backend` | API Express, port 3000 | Non (réseau interne) |
| `frontend` | build `./frontend` | Fichiers statiques servis par nginx, port 80 | Non (réseau interne) |
| `caddy` | `caddy:2-alpine` | Reverse proxy + TLS automatique | **Oui : 80, 443** |

Seul le service `caddy` publie des ports sur l'hôte. Il termine le TLS
(Let's Encrypt) et route le trafic :

- `/api/*` → `backend:3000`
- tout le reste → `frontend:80`

Le routage est défini dans le [`Caddyfile`](../Caddyfile).

---

## 2. Deux scénarios selon votre VPS

Le choix dépend d'**une seule question** : un autre service occupe-t-il déjà les
ports 80 et/ou 443 sur le VPS ?

```bash
# À exécuter sur le VPS avant tout
sudo ss -tlnp | grep -E ':80 |:443 '
```

- **Aucune ligne** → ports libres → **Scénario A** (Caddy intégré).
- **Une ou plusieurs lignes** (nginx, apache2, un autre Caddy, Traefik, etc.)
  → ports occupés → **Scénario B** (derrière un reverse proxy existant).

> ⚠️ Ne lancez pas la stack avant d'avoir tranché. Si les ports sont occupés et
> que vous lancez le scénario A, le conteneur `caddy` échouera avec
> `bind: address already in use` et Caddy ne pourra pas obtenir de certificat.

---

## 3. Prérequis (communs aux deux scénarios)

Sur le VPS :

- **Docker Engine ≥ 24** et **Docker Compose v2**
  ```bash
  docker --version
  docker compose version
  ```
- Un **nom de domaine** (ou sous-domaine) avec un enregistrement **DNS A**
  pointant sur l'IP publique du VPS.

Vérifier la résolution DNS **avant** de lancer Caddy (voir l'avertissement
rate-limit en section 6) :

```bash
dig +short sentinel.exemple.fr   # doit renvoyer l'IP publique du VPS
```

---

## 4. Récupérer le code et configurer `.env`

```bash
git clone <url-du-depot> sentinel
cd sentinel
cp .env.release.example .env
```

Générer les secrets :

```bash
openssl rand -hex 32   # → COOKIE_SECRET
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → POSTGRES_PASSWORD (à reporter aussi dans DATABASE_URL)
echo -n "votre_code_board" | sha256sum   # → BOARD_ACCESS_CODE_HASH
```

Éditer `.env`. Variables à ne pas rater (la liste complète est dans
[runbook.md section 2](runbook.md#2-variables-denvironnement-critiques)) :

| Variable | Valeur attendue |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `CADDY_DOMAIN` | domaine **sans** `https://` ni `/` final — ex. `sentinel.exemple.fr` |
| `CLIENT_ORIGIN` | URL publique complète — ex. `https://sentinel.exemple.fr` |
| `VITE_API_URL` | **identique à `CLIENT_ORIGIN`** (voir l'encadré ci-dessous) |
| `POSTGRES_PASSWORD` | le mot de passe généré |
| `DATABASE_URL` | doit contenir **le même** `POSTGRES_PASSWORD` |
| `ADMIN_PASSWORD` | mot de passe admin fort (≥ 24 caractères) |
| `COOKIE_SECRET`, `JWT_SECRET` | les valeurs `openssl` générées |
| `BOARD_ACCESS_CODE_HASH` | le hash SHA-256 généré |
| `TRUST_PROXY` | `true` (obligatoire derrière un proxy — fait que le rate limiting voit la vraie IP client) |

> ### ⚠️ Piège `VITE_API_URL` — à comprendre absolument
>
> `VITE_API_URL` est une variable **Vite** : elle est **compilée dans le build
> du frontend** au moment du `docker build` (voir l'argument `VITE_API_URL` dans
> [`docker-compose.yml`](../docker-compose.yml) et le `ARG` dans
> [`frontend/Dockerfile`](../frontend/Dockerfile)).
>
> Conséquence : si vous modifiez `VITE_API_URL` **après** avoir buildé, un
> `docker compose restart` ne suffit **pas**. Il faut **rebuilder** le frontend :
> ```bash
> docker compose up -d --build frontend
> ```
> Mettez la bonne valeur **avant** le premier build et vous n'aurez pas le problème.

> ### Note — backend strict en production
>
> Avec `NODE_ENV=production`, le backend **refuse de démarrer** si un secret est
> manquant, trop court, ou laissé sur une valeur de démonstration (logique dans
> [`backend/src/config/production.ts`](../backend/src/config/production.ts)).
> Si le conteneur `backend` redémarre en boucle, ce n'est pas un bug : consultez
> `docker compose logs backend`, le message indique précisément la variable fautive.

---

## 5. Scénario A — VPS dédié, ports 80/443 libres

C'est le scénario par défaut du dépôt : Caddy intégré gère TLS et routage.
Aucune modification du projet n'est nécessaire.

```bash
docker compose up -d --build
docker compose ps         # les 4 services doivent être "running"/"healthy"
```

Passer directement à la **section 7 (vérification)**.

---

## 6. Scénario B — Un reverse proxy existe déjà sur le VPS

Si un serveur web (nginx, Apache, un autre Caddy, Traefik…) occupe déjà 80/443,
le conteneur `caddy` du projet ne peut pas prendre ces ports. Deux approches.
Choisissez **une seule** des deux.

> Les deux approches se configurent **sans modifier le code applicatif** : elles
> reposent uniquement sur un fichier `docker-compose.override.yml`, qui est
> chargé automatiquement par Docker Compose en plus du fichier principal, et qui
> n'est **pas** versionné (à créer sur le VPS). Adaptez les valeurs à **votre**
> proxy — le projet ne connaît pas sa configuration.

### Approche B1 — Le proxy de l'hôte gère le TLS, on expose juste un port HTTP local

On désactive le Caddy conteneurisé et on expose le **frontend** et le **backend**
sur des ports `localhost` de l'hôte. Votre proxy existant fait ensuite le
reverse proxy vers ces ports (et garde la gestion du TLS qu'il assure déjà).

Créer `docker-compose.override.yml` à la racine, sur le VPS :

```yaml
services:
  # Neutralise le Caddy du projet : pas de build, pas de ports publiés.
  caddy:
    deploy:
      replicas: 0

  frontend:
    ports:
      - "127.0.0.1:8080:80"   # frontend accessible sur localhost:8080

  backend:
    ports:
      - "127.0.0.1:3001:3000" # backend accessible sur localhost:3001
```

Puis, **dans la configuration de votre proxy hôte** (à vous d'écrire, selon que
c'est nginx/Apache/Caddy/Traefik), router le domaine ainsi :

- `/api/*` → `http://127.0.0.1:3001`
- tout le reste → `http://127.0.0.1:8080`

C'est exactement la logique du [`Caddyfile`](../Caddyfile) du projet, à reporter
dans la syntaxe de votre proxy. Exemple de correspondance pour un `server` nginx
(à adapter, non testé sur votre machine) :

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Lancer :

```bash
docker compose up -d --build
```

> `TRUST_PROXY=true` reste indispensable : il y a un proxy devant le backend.
> `CLIENT_ORIGIN` / `VITE_API_URL` restent l'URL **publique** HTTPS servie par
> votre proxy, pas les ports localhost.

### Approche B2 — Garder le Caddy du projet, mais sur d'autres ports

Si vous préférez que le Caddy **du projet** continue de gérer TLS et routage,
mais sans entrer en conflit, faites-le écouter sur des ports différents et
laissez votre proxy hôte rediriger vers lui. Cette approche est plus rare et
suppose que votre proxy hôte sache faire du passthrough ou du proxy HTTPS ;
**B1 est généralement plus simple.**

`docker-compose.override.yml` :

```yaml
services:
  caddy:
    ports:
      - "8443:443"
      - "8080:80"
```

Votre proxy hôte doit alors rediriger le domaine vers `127.0.0.1:8443`.
La gestion des certificats devient partagée entre deux proxies, ce qui est
plus délicat — préférez B1 sauf besoin précis.

> **Que choisir ?** Dans la grande majorité des cas, **B1** est le bon choix :
> votre proxy hôte garde le TLS (qu'il sait déjà faire pour vos autres sites), et
> Sentinel n'expose que deux ports HTTP en local. Le Caddy conteneurisé n'est
> alors pas utilisé — c'est normal et sans impact sur l'application.

---

## 7. Vérification

Caddy (scénario A) obtient le certificat Let's Encrypt au premier démarrage :
patienter **30 à 60 secondes**.

> ⚠️ **Rate limit Let's Encrypt.** Si le DNS ne pointe pas (encore) sur le VPS au
> moment où Caddy démarre, l'obtention du certificat échoue. Après plusieurs
> échecs sur le même domaine, Let's Encrypt bloque temporairement les nouvelles
> demandes (jusqu'à une heure). D'où l'importance de valider le DNS **avant**
> (section 3). En cas de doute pendant les essais, consulter
> `docker compose logs caddy`.

```bash
# Santé applicative (vérifie aussi la connexion DB)
curl -sf https://sentinel.exemple.fr/api/health
# Attendu : {"status":"ok","db":"ok"}

# État des conteneurs
docker compose ps
```

Smoke test manuel dans le navigateur :

1. Ouvrir `https://sentinel.exemple.fr/login`.
2. Se connecter en admin avec les identifiants de **votre `.env`**
   (et non `admin` / `admin123`, qui ne sont que les valeurs par défaut de
   développement).
3. Vérifier l'accès Board via le code, puis un parcours workshop.

Pour la recette complète, voir [release-checklist.md](release-checklist.md)
section 4 et [manual-tests.md](manual-tests.md).

---

## 8. Notes spécifiques au déploiement public

- **En-têtes de sécurité.** Le frontend est servi par nginx avec une CSP stricte
  définie dans [`frontend/nginx.conf`](../frontend/nginx.conf). La directive
  `connect-src` y inclut `'self'`, ce qui couvre les appels API tant que le
  frontend et l'API partagent le même domaine public — c'est le cas avec le
  routage Caddy (`/api/*` sur le même domaine). Un résidu `http://localhost:3000`
  y figure pour le développement ; il est sans effet en production puisque
  `'self'` autorise déjà l'origine publique.
- **Backups.** Mettre en place le cron de backup et la copie hors-site décrits
  dans [runbook.md section 3](runbook.md#3-backup-de-la-base-de-données) — un VPS
  reste exposé aux pannes disque.
- **Mises à jour.** Procédure de mise à jour et de retour arrière :
  [runbook.md sections 5 et 11](runbook.md#5-mise-à-jour-de-lapplication).
- **Démonstration temporaire.** Pour une démo limitée dans le temps, penser à
  arrêter proprement la stack après coup : `docker compose down`
  (ajouter `-v` supprime aussi les volumes, donc les données — à n'utiliser que
  si vous voulez tout effacer).
