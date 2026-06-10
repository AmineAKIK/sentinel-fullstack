#!/usr/bin/env bash
# backup.sh — Sauvegarde compressée de la base PostgreSQL Sentinel
#
# Usage:
#   ./scripts/backup.sh [--dir /chemin/vers/backups] [--keep 30]
#
# Variables d'environnement (lues depuis .env si présent) :
#   POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
#   BACKUP_DIR   — répertoire de stockage des backups (défaut: ./backups)
#   BACKUP_KEEP  — nombre de jours de rétention        (défaut: 30)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Charger .env si présent ────────────────────────────────────────────────────
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

# ── Paramètres avec valeurs par défaut ────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"
DB_NAME="${POSTGRES_DB:-sentinel}"
DB_USER="${POSTGRES_USER:-sentinel}"
CONTAINER="${POSTGRES_CONTAINER:-sentinel_postgres}"

# ── Parsing des arguments CLI ─────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)   BACKUP_DIR="$2"; shift 2 ;;
    --keep)  BACKUP_KEEP="$2"; shift 2 ;;
    *)       echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
done

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_FILE="$BACKUP_DIR/sentinel_backup_${TIMESTAMP}.sql.gz"

# ── Créer le répertoire de backups si nécessaire ──────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[backup] Démarrage — $(date)"
echo "[backup] Conteneur  : $CONTAINER"
echo "[backup] Base       : $DB_NAME"
echo "[backup] Fichier    : $BACKUP_FILE"

# ── Vérifier que le conteneur tourne ─────────────────────────────────────────
if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q 'true'; then
  echo "[backup] ERREUR : le conteneur '$CONTAINER' n'est pas en cours d'exécution." >&2
  exit 1
fi

# ── Dump + compression ────────────────────────────────────────────────────────
if docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password --format=plain \
  | gzip -9 > "$BACKUP_FILE"; then
  SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
  echo "[backup] Succès — $SIZE écrits dans $BACKUP_FILE"
else
  echo "[backup] ERREUR : pg_dump a échoué." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ── Nettoyage des anciens backups ─────────────────────────────────────────────
echo "[backup] Nettoyage des backups de plus de ${BACKUP_KEEP} jours..."
find "$BACKUP_DIR" -maxdepth 1 -name "sentinel_backup_*.sql.gz" \
  -mtime +"$BACKUP_KEEP" -print -delete

echo "[backup] Terminé — $(date)"
