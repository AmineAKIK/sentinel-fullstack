# Runbook d'exploitation Sentinel

Ce runbook fait autorité pour **l'instance publique** `sentinel.akiksystems.fr`,
déployée en **topologie B** : images de registry épinglées par digest, derrière
le **Nginx hôte** du VPS (Caddy ne démarre pas). La topologie A (distribution
autonome avec Caddy intégré) est décrite en [annexe](#annexe--topologie-a-caddy-autonome).

Une observation publique strictement en lecture seule, le 30 juillet 2026, a
confirmé ce choix au bord : DNS A `79.137.34.84`, redirection HTTP vers HTTPS,
`Server: nginx` sur 80/443, certificat valide pour le domaine, HSTS et en-têtes
attendus. `/api/health` répond encore avec le SHA RC4
`da97e5222e0978d9e4af08afe70a08d49a80f4de`; aucune RC5 n'a été déployée.
Faute d'accès SSH nominatif, cette lecture ne remplace pas les contrôles
internes des fichiers Compose, conteneurs, images/digests, binds et `nginx -T`.

Deux principes non négociables pour l'instance publique :

- **Images immuables par digest, jamais de reconstruction locale.** Le VPS
  exécute exactement l'image construite et vérifiée en CI. On ne fait jamais
  `git pull` + `docker compose build` sur le VPS.
- **Valeurs de release persistées dans `.env`** (mode `600`), jamais des `export`
  de session : `BUILD_SHA` et les digests survivent à une reconnexion SSH.

Toutes les commandes s'exécutent depuis le répertoire de déploiement, et la
topologie B se compose **toujours** des trois mêmes fichiers Compose :

```bash
SENTINEL_DIR=/var/www/sentinel
cd "$SENTINEL_DIR"
# base + override host-proxy (Nginx hôte) + registry (images par digest)
COMPOSE=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.registry.yml)
```

Toutes les commandes opérationnelles ci-dessous utilisent `"${COMPOSE[@]}"`.

### État de validation attendu pour RC5 avant déploiement

Avant tout déploiement de la RC5, exécuter et archiver sur son SHA exact les
contrôles locaux suivants, sans les confondre avec une preuve du VPS ni avec une
publication d'image :

- les trois compositions Docker et les huit invariants de topologie ;
- builds production backend/frontend, utilisateurs `node`/`nginx`, labels OCI
  `revision`, runtime backend minimal, `nginx -t` read-only et favicon ;
- préflight registry-only, dont digest réel et rejet d'une image d'un autre SHA,
  avec nettoyage intégral ;
- parsing d'environnement et bcrypt runtime byte-identique ;
- sauvegarde/restauration PostgreSQL jetable, avec RTO consigné, checksum,
  verrou, validation exacte du ledger, rejet de schéma et isolation ;
- Nginx 1.18.0 : héritage, barrière, valeurs publiques simulées et modèle hôte
  conformes ;
- ShellCheck de tous les scripts suivis.

Une fois verts sur le SHA RC5, ces résultats prouvent le contrat local, pas
l'état de l'instance publique. Les contrôles VPS, `/api/health`, SMTP réel,
en-têtes HTTPS publics et captures RC5 restent conditionnés à une autorisation
de déploiement séparée.

## 1. Contrôles rapides

```bash
docker compose "${COMPOSE[@]}" config --quiet
docker compose "${COMPOSE[@]}" ps
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
docker compose "${COMPOSE[@]}" logs --since=15m backend frontend postgres
```

État nominal :

- `postgres`, `backend` et `frontend` sont `healthy` ;
- `caddy` n'est **pas** lancé (le TLS est terminé par le Nginx hôte) ;
- `/api/health` répond HTTP 200 et sa propriété `version` égale le SHA du tag
  déployé (`git rev-parse <tag>^{commit}`) ;
- aucune boucle de redémarrage n'apparaît dans `docker compose … ps`.

Le frontal TLS étant le Nginx hôte, ses diagnostics ne passent pas par Compose :

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -n 100 /var/log/nginx/error.log
```

### Contrat des en-têtes du Nginx hôte

Le modèle versionné est `deploy/nginx/sentinel.conf.example`. Il conserve trois
autorités disjointes :

- le Nginx hôte est l'unique autorité HSTS et masque le HSTS des upstreams ;
- le Nginx frontend pose les autres en-têtes des documents et statiques ;
- Node pose les autres en-têtes de `/api/*`.

La directive suivante, placée dans le serveur HTTPS, empêche l'héritage en bloc
d'éventuels `add_header` globaux :

```nginx
add_header X-Sentinel-Inheritance-Barrier "";
```

Nginx n'émet pas un en-tête dont la valeur est vide. Cette barrière ne doit donc
jamais apparaître dans une réponse publique. Le modèle utilise la syntaxe
`listen ... ssl http2` comprise par le Nginx `1.18.0` du serveur hôte.

Le contrôle local reproductible exige un vrai binaire Nginx 1.18.0 :

```bash
./scripts/test-nginx-header-inheritance.sh --nginx-bin /chemin/vers/nginx
```

Il reproduit d'abord la fuite d'un `add_header` global sans barrière, prouve sa
disparition avec la barrière, vérifie les valeurs et occurrences exactes sur
`/login` et `/api/health`, puis exécute `nginx -t` sur le modèle hôte.

### Application atomique du modèle hôte

Cette procédure est une opération de déploiement séparée : ne l'exécuter
qu'après autorisation explicite, depuis un checkout du tag validé. Commencer par
identifier le fichier réellement inclus avec `sudo nginx -T`; ne pas supposer
son chemin. L'exemple ci-dessous emploie
`/etc/nginx/sites-available/sentinel`.

```bash
SENTINEL_NGINX_TARGET=/etc/nginx/sites-available/sentinel
SENTINEL_NGINX_BACKUP=/etc/nginx/sites-available/sentinel.before-rc5
SENTINEL_NGINX_STAGE=/etc/nginx/sites-available/.sentinel.rc5.new

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

Si `nginx -t`, le reload ou le contrôle public échoue, restaurer immédiatement
la sauvegarde par une seconde bascule atomique, revalider, puis recharger :

```bash
SENTINEL_NGINX_TARGET=/etc/nginx/sites-available/sentinel
SENTINEL_NGINX_BACKUP=/etc/nginx/sites-available/sentinel.before-rc5
SENTINEL_NGINX_ROLLBACK=/etc/nginx/sites-available/.sentinel.rollback

sudo install -m 0644 "$SENTINEL_NGINX_BACKUP" "$SENTINEL_NGINX_ROLLBACK"
sudo mv "$SENTINEL_NGINX_ROLLBACK" "$SENTINEL_NGINX_TARGET"
sudo nginx -t
sudo systemctl reload nginx
./scripts/verify-public-headers.sh https://sentinel.akiksystems.fr
```

Conserver la sortie de `nginx -t`, du reload et du vérificateur dans la trace
d'intervention. La présence d'une seule valeur dupliquée, d'un
`X-Sentinel-Inheritance-Barrier` public ou d'un `Cache-Control` inattendu rend
la validation invalide.

## 2. Variables critiques

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `BUILD_SHA` | oui | SHA git 40 hex du tag ; embarqué dans l'image et publié par `/api/health` |
| `SENTINEL_BACKEND_IMAGE` | oui (topo B) | image backend épinglée par digest `@sha256:` |
| `SENTINEL_FRONTEND_IMAGE` | oui (topo B) | image frontend épinglée par digest `@sha256:` |
| `SENTINEL_BACKEND_BIND_PORT` | oui (topo B) | port loopback de publication du backend |
| `SENTINEL_FRONTEND_BIND_PORT` | oui (topo B) | port loopback de publication du frontend |
| `CLIENT_ORIGIN` | oui | origine HTTPS canonique exacte autorisée par CORS/CSRF, sans slash final |
| `TRUST_PROXY` | oui | prise en compte sûre de l'IP via le proxy inverse |
| `POSTGRES_PASSWORD` | oui | mot de passe du service PostgreSQL |
| `DATABASE_URL` | oui | connexion interne du backend à PostgreSQL |
| `COOKIE_SECRET` | oui | signature des cookies Express |
| `JWT_SECRET` | oui | signature des sessions JWT |
| `BOARD_ACCESS_CODE_HASH` | oui | hash bcrypt du code Board initial (entre quotes simples) |
| `ADMIN_USERNAME` | base vide | bootstrap Admin, non vide, max. 80 caractères, non numérique |
| `ADMIN_PASSWORD` | base vide | mot de passe temporaire du premier admin |
| `CADDY_DOMAIN` | topo A | domaine servi par Caddy (annexe uniquement) |

Les variables SMTP, DeepSeek et d'outbox sont documentées dans
`.env.release.example`. Ne jamais mettre un secret dans une commande versionnée,
un ticket public ou une capture d'écran.

## 3. Sauvegarde

### Manuelle

```bash
./scripts/backup.sh
```

Options :

```bash
./scripts/backup.sh --dir /srv/backups/sentinel --keep 30
```

Le script :

- verrouille le répertoire pour éviter deux dumps concurrents ;
- vérifie que le service Compose `postgres` tourne ;
- produit un dump SQL sans propriétaire ni privilèges ;
- compresse dans un fichier temporaire ;
- vérifie l'archive, applique le mode `600` et crée un `.sha256` ;
- supprime les sauvegardes plus anciennes que la rétention configurée.

Validation manuelle :

```bash
gzip -t backups/sentinel_backup_*.sql.gz
cd backups
sha256sum -c sentinel_backup_YYYY-MM-DD_HH-MM-SS.sql.gz.sha256
cd ..
```

### Planifiée

Exemple de cron quotidien à 03:00 :

```cron
0 3 * * * cd /var/www/sentinel && ./scripts/backup.sh >> /var/log/sentinel-backup.log 2>&1
```

Le compte cron doit pouvoir exécuter Docker et lire `/var/www/sentinel/.env`.
Protéger le fichier de log et surveiller explicitement les codes de sortie.

### Hors site

Copier les couples `.sql.gz` / `.sha256` vers un stockage distinct, chiffré et
versionné. Une sauvegarde présente uniquement dans le volume du VPS ne constitue
pas un plan de reprise.

Politique minimale recommandée :

- 7 sauvegardes quotidiennes ;
- 4 sauvegardes hebdomadaires ;
- 3 sauvegardes mensuelles ;
- un test de restauration trimestriel sur une base isolée.

`scripts/test-backup-restore.sh` réalise cet exercice de bout en bout dans un
projet Compose jetable et unique, mesure le temps de restauration (RTO) et
prouve son isolation. Il est sûr à lancer depuis le répertoire de déploiement
(`/var/www/sentinel`) : le projet de production n'est jamais ciblé et le
nettoyage se limite strictement au projet jetable du test.

## 4. Restauration

### Préconditions

1. identifier l'heure exacte du point de reprise ;
2. conserver une copie du backup actuel avant toute action ;
3. prévenir les utilisateurs d'une courte indisponibilité ;
4. vérifier l'espace disque disponible ;
5. ne pas interrompre le script pendant la bascule.

```bash
./scripts/restore.sh backups/sentinel_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
```

Le script refuse de démarrer si une sauvegarde est en cours (verrou partagé avec
`backup.sh`), et refuse tout dump sans fichier `.sha256` associé — sauf ajout
explicite de `--allow-unverified`, qui journalise un avertissement audité :

```bash
./scripts/restore.sh --allow-unverified backups/sentinel_backup_sans_checksum.sql.gz
```

Pour confirmer, saisir exactement le nom de base affiché. Le script importe dans
une base temporaire, contrôle le schéma (quinze tables), puis exige que le
ledger corresponde exactement aux migrations canoniques du checkout — noms,
ordre et checksums — avant d'arrêter le backend et de basculer les bases. En cas
d'échec avant la fin de la bascule, son trap tente de restaurer le nom de la
base initiale.

Après restauration :

```bash
docker compose "${COMPOSE[@]}" ps
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
docker compose "${COMPOSE[@]}" logs --since=10m backend postgres
```

Faire ensuite une recette fonctionnelle : connexion, ouverture d'un incident,
historique, Board et dernier événement d'audit attendu.

## 5. Mise à jour applicative (release par digest)

Une mise à jour = déployer une **nouvelle release immuable**. On ne reconstruit
rien sur le VPS ; on renseigne les valeurs de la release dans `.env`, on tire les
images par digest, on vérifie, on bascule.

```bash
cd "$SENTINEL_DIR"

# 1. renseigner dans .env les valeurs de la NOUVELLE release (depuis les notes
#    de la release GitHub) : BUILD_SHA (git rev-parse <tag>^{commit}),
#    SENTINEL_BACKEND_IMAGE / SENTINEL_FRONTEND_IMAGE (digests @sha256:).
#    Optionnel : aligner l'arbre sur le tag pour migrations/exemples, sans
#    dépendre du .env :  git fetch --tags origin && git checkout <tag>

# 2. sauvegarde
./scripts/backup.sh

# 3. pull non destructif des images par digest (aucun conteneur remplacé)
docker compose "${COMPOSE[@]}" pull backend frontend

# 4. préflight : confronte les digests au BUILD_SHA attendu (label OCI + SHA
#    runtime), sans stopper/reconfigurer aucun service en cours
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"

# 5. bascule sans reconstruction locale (recrée seulement ce qui a changé)
docker compose "${COMPOSE[@]}" up -d --no-build --remove-orphans
docker compose "${COMPOSE[@]}" ps

# 6. health : la version doit égaler le SHA du tag déployé
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
docker compose "${COMPOSE[@]}" logs --since=10m backend frontend
```

Vérifier la CI du commit cible avant la mise à jour. Les migrations sont
appliquées automatiquement au démarrage du backend, sous verrou exclusif et avec
vérification de checksum. Après démarrage, comparer la propriété `version` de
`/api/health` au SHA du tag avant la recette. **Ne jamais `docker compose down`
pour une mise à jour normale** : `up -d` recrée uniquement les conteneurs dont
l'image ou la configuration a changé.

## 6. Rotation des secrets

### Cookie et JWT

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Remplacer les deux valeurs dans `.env`, puis recréer le backend **sans
reconstruction locale** :

```bash
docker compose "${COMPOSE[@]}" up -d --no-build --force-recreate backend
```

La rotation de `JWT_SECRET` invalide toutes les sessions. Planifier l'opération
et prévenir les utilisateurs.

### Code Board

La voie normale est Administration > Paramètres. En procédure de secours :

```bash
cd backend
BOARD_ACCESS_CODE='nouveau-code-temporaire' npm run hash:board
cd ..
```

Mettre le hash bcrypt obtenu dans `.env` **entre quotes simples**
(`BOARD_ACCESS_CODE_HASH='$2b$...'`) : sans quotes, Compose interpole les `$` et
tronque le hash. Recréer le backend (`up -d --no-build --force-recreate backend`),
puis vérifier une nouvelle connexion Board. Les sessions Board antérieures
peuvent rester valides jusqu'à leur expiration ; une rotation du `JWT_SECRET` les
invalide toutes.

### Mot de passe admin

La voie normale est Administration > Sécurité. Si l'accès est perdu :

```bash
docker compose "${COMPOSE[@]}" exec -T backend node dist/scripts/reset-admin-password.js
```

La commande choisit l'admin unique, remplace son mot de passe dans une transaction
et incrémente `session_version`. Le mot de passe temporaire est affiché une seule
fois dans le terminal ; le transmettre par un canal interne sûr puis le changer
immédiatement dans l'interface.

### PostgreSQL

La rotation exige une fenêtre de maintenance : backup, arrêt de l'application,
modification du rôle PostgreSQL, mise à jour simultanée de `POSTGRES_PASSWORD` et
`DATABASE_URL`, puis redémarrage et test de santé. Tester la procédure sur un
environnement de préproduction avant la production.

## 7. Logs et diagnostic

```bash
docker compose "${COMPOSE[@]}" logs --follow --tail=200
docker compose "${COMPOSE[@]}" logs --follow --tail=200 backend
docker compose "${COMPOSE[@]}" logs --since=1h backend | grep -Ei 'error|fatal|migration|shutdown'
docker compose "${COMPOSE[@]}" stats --no-stream
docker system df
df -h
```

Le frontal TLS de l'instance publique est le **Nginx hôte**, hors Compose :

```bash
sudo nginx -t
sudo tail -n 200 /var/log/nginx/{access,error}.log
```

Les logs Docker sont limités à cinq fichiers de 10 Mo par service. Le backend
masque, dans les journaux HTTP, les cookies et en-têtes d'autorisation entrants
ainsi que l'en-tête `Set-Cookie` sortant (qui transporte le jeton de session
signé) — la liste des chemins masqués est centralisée dans
`backend/src/httpLogging.ts` et couverte par un test de journalisation réelle.
Ne pas augmenter le niveau de log en production sans surveiller le volume.

### Test de charge

`scripts/load-test.js` (k6) mesure la latence de `/api/health` sous un débit
constant de 2 req/s pendant deux minutes — sous le seuil de rate limiting
nominal (`GLOBAL_API_RATE_LIMIT_MAX=3000` sur 15 min, soit ~3,3 req/s/IP).
Manuel, non intégré à la CI : à exécuter contre une instance dédiée, jamais
contre la base de test partagée des autres suites.

```bash
k6 run --env BASE_URL=http://127.0.0.1:<port_backend_loopback> scripts/load-test.js
```

Seuils attendus : moins de 1 % d'échecs, p95 sous 300 ms, p99 sous 800 ms.

## 8. Procédures d'incident

### Site inaccessible

```bash
docker compose "${COMPOSE[@]}" ps
docker compose "${COMPOSE[@]}" logs --since=15m frontend backend
curl --verbose https://sentinel.akiksystems.fr/api/health
# frontal TLS = Nginx hôte
sudo nginx -t && sudo systemctl status nginx
sudo tail -n 100 /var/log/nginx/error.log
```

- échec TLS : contrôler DNS, ports 80/443, horloge et logs du **Nginx hôte** ;
- frontend sain mais API 502/503 : contrôler backend et PostgreSQL, et que le
  `proxy_pass` du vhost pointe le bon port loopback ;
- service arrêté : lire ses logs avant de le relancer ;
- boucle de redémarrage : ne pas masquer l'erreur avec des redémarrages répétés.

### PostgreSQL indisponible

```bash
docker compose "${COMPOSE[@]}" ps postgres
docker compose "${COMPOSE[@]}" logs --tail=200 postgres
docker compose "${COMPOSE[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER:-sentinel}" -d "${POSTGRES_DB:-sentinel}"
```

Vérifier l'espace disque et les permissions du volume. Ne restaurer qu'après
avoir distingué une indisponibilité transitoire d'une corruption réelle.

### Migration refusée

Le backend s'arrête si le ledger contient une migration absente ou si le checksum
d'une migration appliquée ne correspond plus au fichier. Ne jamais modifier une
migration publiée. Restaurer le fichier d'origine ou ajouter une nouvelle
migration corrective, puis publier une nouvelle release.

### Notifications en échec

Vérifier SMTP et les logs du worker. L'outbox conserve les tentatives, applique
un backoff et marque les messages définitivement échoués après la limite
configurée. Corriger la configuration avant de relancer le backend ; ne pas
supprimer l'outbox sans analyse.

### Espace disque saturé

```bash
df -h
docker system df
du -sh backups/* 2>/dev/null | sort -h
```

Exporter les backups avant suppression. Ne jamais exécuter
`docker compose … down -v` : l'option `-v` supprimerait les données PostgreSQL.

## 9. Retour arrière (rollback par digest précédent)

Le rollback de l'instance publique **ne reconstruit rien** et ne fait pas de
`git checkout` de production : on redéploie les **digests de la release
précédente**. Un rollback du code n'implique pas automatiquement un rollback du
schéma : vérifier d'abord si les migrations de la release fautive restent
compatibles avec le commit précédent.

```bash
cd "$SENTINEL_DIR"

# 1. remettre dans .env les valeurs de la release PRÉCÉDENTE (BUILD_SHA + digests
#    @sha256:), relevées lors de son propre déploiement (trace d'intervention §10)

# 2. pull des digests précédents (déjà en cache local le plus souvent)
docker compose "${COMPOSE[@]}" pull backend frontend

# 3. préflight sur ces digests
./scripts/preflight.sh --env-file "$SENTINEL_DIR/.env" "${COMPOSE[@]}"

# 4. bascule sans reconstruction
docker compose "${COMPOSE[@]}" up -d --no-build --remove-orphans
curl --fail --show-error https://sentinel.akiksystems.fr/api/health
```

Si le schéma n'est pas rétrocompatible, restaurer le backup pris juste avant le
déploiement avec `scripts/restore.sh`, puis redéployer les digests précédents.

## 10. Trace d'intervention

Pour chaque opération sensible, consigner hors du dépôt :

- date, intervenant et motif ;
- `BUILD_SHA` et digests déployés avant/après (indispensables au rollback) ;
- backup utilisé et checksum ;
- commandes structurantes exécutées ;
- résultat des contrôles de santé et de recette ;
- décision de clôture ou d'escalade.

## Annexe — Topologie A (Caddy autonome)

La distribution autonome n'utilise **pas** le Nginx hôte : Caddy est l'unique
point d'entrée TLS et publie `80`/`443`. Elle vise un déploiement autonome
(démo, préproduction), pas l'instance publique. La composition n'utilise alors
que **deux** fichiers (base + registry), sans l'override host-proxy :

```bash
COMPOSE_A=(-f docker-compose.yml -f docker-compose.registry.yml)
```

Différences par rapport à la topologie B :

- `CADDY_DOMAIN` doit être renseigné ; le profil `bundled-edge` est actif et
  `caddy` doit être `running` ;
- les diagnostics TLS passent par les logs Caddy
  (`docker compose "${COMPOSE_A[@]}" logs --since=15m caddy`), pas par le Nginx
  hôte ;
- aucune variable `SENTINEL_*_BIND_PORT` n'est requise : seuls `80`/`443` sont
  publiés ;
- ne jamais supprimer le volume de certificats Caddy lors d'un nettoyage disque.

Tout le reste (sauvegarde, restauration, rotation des secrets, mise à jour et
rollback par digest) est identique, en substituant `"${COMPOSE_A[@]}"` à
`"${COMPOSE[@]}"`.
