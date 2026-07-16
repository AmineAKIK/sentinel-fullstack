#!/usr/bin/env bash
# Sauvegarde PostgreSQL Sentinel, atomique et vérifiée.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"
DB_NAME="${POSTGRES_DB:-sentinel}"
DB_USER="${POSTGRES_USER:-sentinel}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"

compose() {
  docker compose --project-directory "$PROJECT_ROOT" -f "$COMPOSE_FILE" "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      [[ $# -ge 2 ]] || { echo "[backup] --dir exige une valeur." >&2; exit 2; }
      BACKUP_DIR="$2"
      shift 2
      ;;
    --keep)
      [[ $# -ge 2 ]] || { echo "[backup] --keep exige une valeur." >&2; exit 2; }
      BACKUP_KEEP="$2"
      shift 2
      ;;
    *)
      echo "[backup] Option inconnue : $1" >&2
      exit 2
      ;;
  esac
done

[[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] || { echo "[backup] BACKUP_KEEP doit être un entier positif." >&2; exit 2; }
[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "[backup] Nom de base invalide." >&2; exit 2; }
[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "[backup] Nom d'utilisateur PostgreSQL invalide." >&2; exit 2; }
[[ -n "${POSTGRES_PASSWORD:-}" ]] || { echo "[backup] POSTGRES_PASSWORD est obligatoire." >&2; exit 2; }
[[ -f "$COMPOSE_FILE" && -r "$COMPOSE_FILE" ]] || { echo "[backup] Fichier Compose introuvable ou illisible." >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "[backup] Docker est introuvable." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "[backup] Docker Compose v2 est requis." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.sentinel-backup.lock"
if ! flock -n 9; then
  echo "[backup] Une sauvegarde est déjà en cours." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_FILE="$BACKUP_DIR/sentinel_backup_${TIMESTAMP}.sql.gz"
TEMP_FILE="${BACKUP_FILE}.tmp"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

cleanup() {
  rm -f "$TEMP_FILE"
}
trap cleanup EXIT INT TERM

if ! compose ps --status running --services 2>/dev/null | grep -qx 'postgres'; then
  echo "[backup] Le service Compose 'postgres' n'est pas en cours d'exécution." >&2
  exit 1
fi

echo "[backup] Sauvegarde de '$DB_NAME' vers '$BACKUP_FILE'..."
compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password --format=plain \
    --no-owner --no-privileges \
  | gzip -9 > "$TEMP_FILE"

[[ -s "$TEMP_FILE" ]] || { echo "[backup] Le dump produit est vide." >&2; exit 1; }
gzip -t "$TEMP_FILE"
mv "$TEMP_FILE" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$BACKUP_FILE")" > "$(basename "$CHECKSUM_FILE")"
)
chmod 600 "$CHECKSUM_FILE"

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "[backup] Sauvegarde vérifiée : $SIZE."

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'sentinel_backup_*.sql.gz' -o -name 'sentinel_backup_*.sql.gz.sha256' \) \
  -mtime +"$BACKUP_KEEP" -print -delete

trap - EXIT INT TERM
echo "[backup] Terminé."
