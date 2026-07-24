# Runbook d'exploitation Sentinel

Ce runbook couvre les opérations courantes de la stack Docker Compose fournie
par le dépôt. Toutes les commandes sont lancées depuis la racine du déploiement,
par exemple `/opt/sentinel`.

Au début de chaque session d'exploitation, exporter le SHA du checkout. Cette
valeur alimente le label et l'environnement de l'image backend :

```bash
export BUILD_SHA="$(git rev-parse HEAD)"
```

## 1. Contrôles rapides

```bash
docker compose config --quiet
docker compose ps
curl --fail --show-error https://sentinel.example.com/api/health
docker compose logs --since=15m backend frontend caddy postgres
```

État nominal :

- `postgres`, `backend` et `frontend` sont `healthy` ;
- `caddy` est `running`, sauf sur la variante Nginx hôte où il est désactivé ;
- `/api/health` répond HTTP 200 et sa propriété `version` égale `git rev-parse HEAD` ;
- aucune boucle de redémarrage n'apparaît dans `docker compose ps`.

## 2. Variables critiques

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `CADDY_DOMAIN` | oui | domaine public servi par Caddy |
| `BUILD_SHA` | oui au build | commit Git exact embarqué dans l'image backend |
| `CLIENT_ORIGIN` | oui | origine HTTPS exacte autorisée par CORS |
| `TRUST_PROXY` | oui | prise en compte sûre de l'IP via le proxy inverse |
| `POSTGRES_PASSWORD` | oui | mot de passe du service PostgreSQL |
| `DATABASE_URL` | oui | connexion interne du backend à PostgreSQL |
| `COOKIE_SECRET` | oui | signature des cookies Express |
| `JWT_SECRET` | oui | signature des sessions JWT |
| `BOARD_ACCESS_CODE_HASH` | oui | hash bcrypt du code Board initial |
| `ADMIN_USERNAME` | base vide | bootstrap Admin, non vide, max. 80 caractères, non numérique |
| `ADMIN_PASSWORD` | base vide | mot de passe temporaire du premier admin |
| `VITE_API_URL` | vide en same-origin | surcharge de l'origine API au build |

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
0 3 * * * cd /opt/sentinel && ./scripts/backup.sh >> /var/log/sentinel-backup.log 2>&1
```

Le compte cron doit pouvoir exécuter Docker et lire `/opt/sentinel/.env`.
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
une base temporaire, contrôle le schéma (quinze tables), le ledger de migrations
et des colonnes témoins, arrête le backend, bascule les bases puis redémarre le
service. En cas d'échec avant la fin de la bascule, son trap tente de restaurer
le nom de la base initiale.

Après restauration :

```bash
docker compose ps
curl --fail --show-error https://sentinel.example.com/api/health
docker compose logs --since=10m backend postgres
```

Faire ensuite une recette fonctionnelle : connexion, ouverture d'un incident,
historique, Board et dernier événement d'audit attendu.

## 5. Mise à jour applicative

```bash
./scripts/backup.sh
git fetch origin
git status --short
git pull --ff-only origin main
export BUILD_SHA="$(git rev-parse HEAD)"
docker compose config --quiet
docker compose build backend frontend
docker compose up -d --remove-orphans
docker compose ps
curl --fail --show-error https://sentinel.example.com/api/health
docker compose logs --since=10m backend frontend caddy
```

Ne pas déployer depuis un arbre Git sale. Vérifier la CI du commit cible avant la
mise à jour. Les migrations sont appliquées automatiquement au démarrage du
backend, sous verrou exclusif et avec vérification de checksum. Après démarrage,
comparer la propriété `version` de `/api/health` à `$BUILD_SHA` avant la recette.

## 6. Rotation des secrets

### Cookie et JWT

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Remplacer les deux valeurs dans `.env`, puis :

```bash
docker compose up -d --force-recreate backend
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

Mettre le hash bcrypt obtenu dans `.env` **en doublant chaque `$` en `$$`**
(Compose interpole sinon les `$` et tronque le hash), recréer le backend, puis
vérifier une nouvelle connexion Board. Les sessions Board antérieures peuvent
rester valides jusqu'à leur expiration ; une rotation du `JWT_SECRET` les
invalide toutes.

### Mot de passe admin

La voie normale est Administration > Sécurité. Si l'accès est perdu :

```bash
docker compose exec -T backend node dist/scripts/reset-admin-password.js
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
docker compose logs --follow --tail=200
docker compose logs --follow --tail=200 backend
docker compose logs --since=1h backend | grep -Ei 'error|fatal|migration|shutdown'
docker compose stats --no-stream
docker system df
df -h
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
k6 run --env BASE_URL=http://127.0.0.1:3000 scripts/load-test.js
```

Seuils attendus : moins de 1 % d'échecs, p95 sous 300 ms, p99 sous 800 ms.

## 8. Procédures d'incident

### Site inaccessible

```bash
docker compose ps
docker compose logs --since=15m caddy frontend backend
curl --verbose https://sentinel.example.com/api/health
```

- échec TLS : contrôler DNS, ports 80/443, horloge et logs Caddy ;
- frontend sain mais API 502/503 : contrôler backend et PostgreSQL ;
- service arrêté : lire ses logs avant de le relancer ;
- boucle de redémarrage : ne pas masquer l'erreur avec des redémarrages répétés.

### PostgreSQL indisponible

```bash
docker compose ps postgres
docker compose logs --tail=200 postgres
docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-sentinel}" -d "${POSTGRES_DB:-sentinel}"
```

Vérifier l'espace disque et les permissions du volume. Ne restaurer qu'après
avoir distingué une indisponibilité transitoire d'une corruption réelle.

### Migration refusée

Le backend s'arrête si le ledger contient une migration absente ou si le checksum
d'une migration appliquée ne correspond plus au fichier. Ne jamais modifier une
migration publiée. Restaurer le fichier d'origine ou ajouter une nouvelle
migration corrective.

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
`docker compose down -v` : l'option `-v` supprimerait les données PostgreSQL et
les données de certificat Caddy.

## 9. Retour arrière

Un rollback du code n'implique pas automatiquement un rollback du schéma. Avant
la mise en production, vérifier si les nouvelles migrations restent compatibles
avec le commit précédent.

```bash
docker compose stop backend frontend
git checkout <commit_precedent_valide>
export BUILD_SHA="$(git rev-parse HEAD)"
docker compose build backend frontend
docker compose up -d
curl --fail --show-error https://sentinel.example.com/api/health
```

Si le schéma n'est pas rétrocompatible, restaurer le backup pris juste avant le
déploiement avec `scripts/restore.sh`, puis relancer le commit précédent.

## 10. Trace d'intervention

Pour chaque opération sensible, consigner hors du dépôt :

- date, intervenant et motif ;
- commit déployé avant/après ;
- backup utilisé et checksum ;
- commandes structurantes exécutées ;
- résultat des contrôles de santé et de recette ;
- décision de clôture ou d'escalade.
