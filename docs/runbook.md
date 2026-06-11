# Runbook opérationnel — Sentinel

Ce document décrit les procédures d'exploitation à connaître avant de mettre Sentinel en production.
Il complète la checklist `release-checklist.md` qui couvre la validation avant déploiement.

---

## 1. Premier déploiement

### Prérequis sur le serveur
- Docker Engine >= 24 et Docker Compose v2
- Ports 80 et 443 ouverts en entrée
- Un nom de domaine DNS pointant sur l'IP du serveur

### Étapes

```bash
# 1. Cloner le dépôt
git clone <url-du-depot> sentinel
cd sentinel

# 2. Préparer la configuration
cp .env.release.example .env
# Éditer .env et remplacer TOUS les placeholders (voir section 2 ci-dessous)

# 3. Générer les secrets
openssl rand -hex 32  # → COOKIE_SECRET
openssl rand -hex 32  # → JWT_SECRET
openssl rand -hex 32  # → POSTGRES_PASSWORD (copier aussi dans DATABASE_URL)
openssl rand -hex 16  # → code board en clair, puis hacher :
echo -n "votre_code_board" | sha256sum  # → BOARD_ACCESS_CODE_HASH

# 4. Lancer la stack
docker compose up -d --build

# 5. Vérifier que tout est sain
docker compose ps
curl -sf https://sentinel.example.com/api/health
```

Caddy obtient automatiquement un certificat Let's Encrypt au premier démarrage.
Ce processus peut prendre 30 à 60 secondes.

---

## 2. Variables d'environnement critiques

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NODE_ENV` | oui | Doit être `production` |
| `CADDY_DOMAIN` | oui | Domaine public sans `https://` ni `/` |
| `CLIENT_ORIGIN` | oui | URL publique complète du frontend |
| `VITE_API_URL` | oui | Même valeur que `CLIENT_ORIGIN` |
| `POSTGRES_PASSWORD` | oui | Mot de passe DB (≥ 24 chars) |
| `DATABASE_URL` | oui | URL de connexion complète à PostgreSQL |
| `ADMIN_USERNAME` | oui | Identifiant du compte admin |
| `ADMIN_PASSWORD` | oui | Mot de passe admin (≥ 24 chars) |
| `COOKIE_SECRET` | oui | 64 chars hex (`openssl rand -hex 32`) |
| `JWT_SECRET` | oui | 64 chars hex (`openssl rand -hex 32`) |
| `BOARD_ACCESS_CODE_HASH` | oui | SHA-256 hex du code d'accès board |
| `TRUST_PROXY` | oui | `true` derrière Caddy |
| `DEEPSEEK_API_KEY` | non | Désactive le support IA si absent |
| `LOG_LEVEL` | non | `info` par défaut |

Le backend refuse de démarrer en production si une valeur critique manque ou est faible.

---

## 3. Backup de la base de données

### Backup manuel

```bash
./scripts/backup.sh
# Le fichier est créé dans ./backups/sentinel_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
```

Options disponibles :
```bash
./scripts/backup.sh --dir /mnt/nas/sentinel-backups --keep 60
```

### Backup automatique (cron recommandé)

Ajouter dans `crontab -e` sur le serveur :
```
# Backup quotidien à 3h00, rétention 30 jours
0 3 * * * cd /srv/sentinel && ./scripts/backup.sh >> /var/log/sentinel-backup.log 2>&1
```

Vérifier que les backups sont bien créés le lendemain :
```bash
ls -lh backups/
```

### Copier les backups hors site

Les backups sur le même serveur que les données ne protègent pas contre une panne disque.
Mettre en place une copie vers un stockage externe (NAS, S3, rclone, rsync) :

```bash
# Exemple avec rsync vers un NAS
rsync -az --delete backups/ user@nas:/srv/sentinel-backups/

# Exemple avec rclone vers S3/Backblaze/etc.
rclone sync backups/ remote:sentinel-backups/
```

---

## 4. Restauration de la base de données

**Tester la restauration sur un environnement temporaire avant d'en avoir besoin.**

```bash
# Lister les backups disponibles
ls -lht backups/

# Restaurer depuis un backup spécifique
./scripts/restore.sh backups/sentinel_backup_2026-06-09_03-00-00.sql.gz
```

Le script demande une confirmation explicite (`oui`) avant d'écraser la base.

Après restauration, les migrations sont rejouées automatiquement au prochain démarrage du backend.
Si le backend est déjà lancé, le redémarrer :
```bash
docker compose restart backend
```

---

## 5. Mise à jour de l'application

```bash
# 1. Sauvegarder avant toute mise à jour
./scripts/backup.sh

# 2. Récupérer les nouvelles sources
git pull

# 3. Rebuilder et relancer
docker compose up -d --build

# 4. Vérifier la santé
docker compose ps
curl -sf https://sentinel.example.com/api/health
```

Les migrations de schéma s'appliquent automatiquement au démarrage du backend.
En cas de problème, restaurer le backup pris en étape 1 et revenir au commit précédent :
```bash
git checkout <commit-precedent>
./scripts/restore.sh backups/<dernier-backup>.sql.gz
docker compose up -d --build
```

---

## 6. Rotation des secrets

La rotation des secrets JWT/COOKIE invalide toutes les sessions actives.
Prévenir les utilisateurs si possible.

```bash
# 1. Générer les nouveaux secrets
NEW_COOKIE=$(openssl rand -hex 32)
NEW_JWT=$(openssl rand -hex 32)

# 2. Mettre à jour .env
# Remplacer COOKIE_SECRET et JWT_SECRET par les nouvelles valeurs

# 3. Redémarrer le backend (les sessions existantes seront invalidées)
docker compose restart backend

# 4. Vérifier
curl -sf https://sentinel.example.com/api/health
```

---

## 7. Rotation du mot de passe admin

Le mot de passe admin peut être changé depuis l'interface :
`Interface admin → Menu → Changer le mot de passe`

Cela nécessite de connaître le mot de passe actuel.

Si le mot de passe actuel est perdu (urgence) :
```bash
# 1. Générer un nouveau hash bcrypt (nécessite node)
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('nouveau_mot_de_passe', 12).then(h => console.log(h));
"

# 2. Mettre à jour directement en base
docker exec -it sentinel_postgres psql -U sentinel -d sentinel \
  -c "UPDATE admin_accounts SET password_hash = '\$hash_genere' WHERE username = 'admin';"

# 3. Se reconnecter avec le nouveau mot de passe
```

---

## 8. Consulter les logs

```bash
# Logs en temps réel de tous les services
docker compose logs -f

# Logs du backend uniquement
docker compose logs -f backend

# Logs des 500 dernières lignes du backend
docker compose logs --tail=500 backend

# Filtrer les erreurs
docker compose logs backend 2>&1 | grep '"level":50'  # level 50 = error en Pino

# Logs formatés lisiblement (nécessite pino-pretty installé localement)
docker compose logs backend 2>&1 | npx pino-pretty
```

Les logs sont en JSON structuré (format Pino). Chaque ligne contient :
- `level` : 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
- `time` : timestamp ISO
- `msg` : message
- `req` / `res` : détails de la requête HTTP (pour les request logs)
- `err` : stack trace en cas d'erreur

---

## 9. Surveillance du service

### Vérification manuelle

```bash
# Health check complet (vérifie aussi la DB)
curl -sf https://sentinel.example.com/api/health
# Réponse attendue : {"status":"ok","db":"ok"}

# État des conteneurs
docker compose ps

# Utilisation des ressources
docker stats --no-stream
```

### Monitoring externe (recommandé)

Configurer un service de monitoring externe (UptimeRobot, Better Uptime, etc.)
pour pinger `https://sentinel.example.com/api/health` toutes les 5 minutes
et envoyer une alerte email/SMS si le service ne répond pas.

---

## 10. Procédure d'incident

### Service inaccessible

```bash
# 1. Vérifier l'état des conteneurs
docker compose ps

# 2. Si un conteneur est arrêté, le relancer
docker compose start backend   # ou frontend, postgres, caddy

# 3. Inspecter les logs du conteneur défaillant
docker compose logs --tail=100 backend

# 4. Si le problème persiste, redémarrer la stack complète
docker compose restart

# 5. En dernier recours : arrêt propre et redémarrage complet
docker compose down
docker compose up -d
```

### Base de données corrompue ou inaccessible

```bash
# 1. Vérifier l'état du conteneur PostgreSQL
docker compose logs --tail=50 postgres

# 2. Tenter une reconnexion du pool
docker compose restart backend

# 3. Si la base est corrompue, restaurer depuis le dernier backup
./scripts/restore.sh backups/<dernier-backup>.sql.gz
docker compose restart backend
```

### Espace disque saturé

```bash
# Vérifier l'espace disponible
df -h

# Identifier les gros fichiers
du -sh /var/lib/docker/volumes/sentinel_*/
du -sh backups/

# Nettoyer les vieux backups manuellement si nécessaire
find backups/ -name "sentinel_backup_*.sql.gz" -mtime +7 -delete

# Nettoyer les images Docker inutilisées
docker image prune -f
```

---

## 11. Plan de retour arrière

En cas de mise à jour qui se passe mal :

```bash
# 1. Arrêter la stack
docker compose down

# 2. Revenir au commit précédent
git log --oneline -5   # identifier le commit stable
git checkout <commit-stable>

# 3. Restaurer la base si des migrations avaient été appliquées
./scripts/restore.sh backups/<backup-avant-mise-a-jour>.sql.gz

# 4. Relancer
docker compose up -d --build
```

---

## 12. Contacts et accès

> Compléter cette section avec les informations propres au déploiement.

| Rôle | Contact |
|------|---------|
| Responsable technique | — |
| Accès serveur | — |
| Accès DNS | — |
| Monitoring (UptimeRobot, etc.) | — |
