#!/usr/bin/env bash
# Restauration PostgreSQL Sentinel avec validation avant bascule.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/lib/env.sh
source "$SCRIPT_DIR/lib/env.sh"

# Lecture SÛRE du .env (voir scripts/lib/env.sh) : aucun `source` du contenu,
# uniquement les variables nécessaires. Les valeurs déjà dans l'environnement
# restent prioritaires.
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  for _var in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD COMPOSE_FILE; do
    if [[ -z "${!_var:-}" ]]; then
      _value="$(read_env_var "$PROJECT_ROOT/.env" "$_var")"
      [[ -n "$_value" ]] && printf -v "$_var" '%s' "$_value"
    fi
  done
  unset _var _value
fi

DB_NAME="${POSTGRES_DB:-sentinel}"
DB_USER="${POSTGRES_USER:-sentinel}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
ALLOW_UNVERIFIED=false

compose() {
  docker compose --project-directory "$PROJECT_ROOT" -f "$COMPOSE_FILE" "$@"
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-unverified)
      ALLOW_UNVERIFIED=true
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done
set -- "${ARGS[@]}"

if [[ $# -ne 1 ]]; then
  echo "Usage : $0 [--allow-unverified] <fichier_backup.sql.gz>" >&2
  exit 2
fi

BACKUP_FILE="$1"
[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "[restore] Nom de base invalide." >&2; exit 2; }
[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "[restore] Nom d'utilisateur PostgreSQL invalide." >&2; exit 2; }
[[ -n "${POSTGRES_PASSWORD:-}" ]] || { echo "[restore] POSTGRES_PASSWORD est obligatoire." >&2; exit 2; }
[[ -f "$BACKUP_FILE" && -r "$BACKUP_FILE" ]] || { echo "[restore] Backup introuvable ou illisible." >&2; exit 2; }
[[ -f "$COMPOSE_FILE" && -r "$COMPOSE_FILE" ]] || { echo "[restore] Fichier Compose introuvable ou illisible." >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "[restore] Docker est introuvable." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "[restore] Docker Compose v2 est requis." >&2; exit 1; }
gzip -t "$BACKUP_FILE"

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  (
    cd "$(dirname "$BACKUP_FILE")"
    sha256sum -c "$(basename "${BACKUP_FILE}.sha256")"
  )
elif [[ "$ALLOW_UNVERIFIED" == true ]]; then
  echo "[restore] AVERTISSEMENT AUDITÉ : restauration sans SHA-256 autorisée explicitement via --allow-unverified (fichier : $BACKUP_FILE)." >&2
else
  echo "[restore] Refusé : aucun fichier SHA-256 associé à '$BACKUP_FILE'." >&2
  echo "[restore] Relancez avec --allow-unverified pour forcer, en connaissance de cause." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.sentinel-backup.lock"
if ! flock -n 9; then
  echo "[restore] Une sauvegarde ou restauration est déjà en cours." >&2
  exit 1
fi

if ! compose ps --status running --services 2>/dev/null | grep -qx 'postgres'; then
  echo "[restore] Le service Compose 'postgres' n'est pas actif." >&2
  exit 1
fi

read -r -p "Saisissez le nom de la base '$DB_NAME' pour confirmer la restauration : " CONFIRM
[[ "$CONFIRM" == "$DB_NAME" ]] || { echo "[restore] Annulé."; exit 0; }

SUFFIX="$(date +%Y%m%d%H%M%S)_$$"
TEMP_DB="${DB_NAME}_restore_${SUFFIX}"
OLD_DB="${DB_NAME}_before_${SUFFIX}"
BACKEND_WAS_RUNNING=false
SWAP_STARTED=false
SWAP_COMPLETED=false

psql_admin() {
  compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    psql -U "$DB_USER" -d postgres --no-password --set=ON_ERROR_STOP=1 "$@"
}

database_exists() {
  local name="$1"
  [[ "$(psql_admin -Atq -c "SELECT 1 FROM pg_database WHERE datname = '$name';")" == "1" ]]
}

cleanup() {
  local exit_code=$?
  set +e
  if [[ "$SWAP_STARTED" == true && "$SWAP_COMPLETED" == false ]] \
     && ! database_exists "$DB_NAME" && database_exists "$OLD_DB"; then
    echo "[restore] Retour arrière du nom de base..." >&2
    psql_admin -c "ALTER DATABASE \"$OLD_DB\" RENAME TO \"$DB_NAME\";"
  fi
  if database_exists "$TEMP_DB"; then
    psql_admin \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEMP_DB' AND pid <> pg_backend_pid();" \
      -c "DROP DATABASE \"$TEMP_DB\";"
  fi
  if [[ "$BACKEND_WAS_RUNNING" == true ]]; then
    compose start backend >/dev/null
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

echo "[restore] Création de la base temporaire '$TEMP_DB'..."
psql_admin -c "CREATE DATABASE \"$TEMP_DB\" OWNER \"$DB_USER\";"

echo "[restore] Import transactionnel dans la base temporaire..."
gunzip -c "$BACKUP_FILE" \
  | compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
      psql -U "$DB_USER" -d "$TEMP_DB" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction --quiet

echo "[restore] Validation du schéma, du ledger de migrations et des données témoins..."
VALIDATION_SQL="
SELECT
  to_regclass('public.schema_migrations') IS NOT NULL
  AND to_regclass('public.sentinel_users') IS NOT NULL
  AND to_regclass('public.admin_accounts') IS NOT NULL
  AND to_regclass('public.production_lines') IS NOT NULL
  AND to_regclass('public.production_line_machines') IS NOT NULL
  AND to_regclass('public.workshop_incidents') IS NOT NULL
  AND to_regclass('public.workshop_incident_events') IS NOT NULL
  AND to_regclass('public.workshop_incident_followers') IS NOT NULL
  AND to_regclass('public.workshop_arbitration_cases') IS NOT NULL
  AND to_regclass('public.workshop_arbitration_consultations') IS NOT NULL
  AND to_regclass('public.line_audit_events') IS NOT NULL
  AND to_regclass('public.account_audit_events') IS NOT NULL
  AND to_regclass('public.admin_system_audit_events') IS NOT NULL
  AND to_regclass('public.password_reset_requests') IS NOT NULL
  AND to_regclass('public.notification_outbox') IS NOT NULL
;
"
SCHEMA_OK="$(compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$DB_USER" -d "$TEMP_DB" --no-password --set=ON_ERROR_STOP=1 -Atq \
  -c "$VALIDATION_SQL" 2>/dev/null || echo f)"
[[ "$SCHEMA_OK" == "t" ]] || {
  echo "[restore] Le dump ne contient pas les tables attendues du schéma Sentinel." >&2
  exit 1
}

LEDGER_SQL="
SELECT
  (SELECT count(*) FROM schema_migrations) > 0
  AND (SELECT count(*) FROM schema_migrations WHERE checksum IS NULL) = 0
  AND (SELECT count(*) FROM schema_migrations WHERE applied_at IS NULL) = 0
  AND (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sentinel_users' AND column_name = 'badge_number') = 1
  AND (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'workshop_incidents' AND column_name = 'status') = 1
  AND (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'production_lines' AND column_name = 'line_number') = 1;
"
LEDGER_OK="$(compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$DB_USER" -d "$TEMP_DB" --no-password --set=ON_ERROR_STOP=1 -Atq \
  -c "$LEDGER_SQL" 2>/dev/null || echo f)"
[[ "$LEDGER_OK" == "t" ]] || {
  echo "[restore] Le ledger de migrations ou les colonnes témoins sont incohérents." >&2
  exit 1
}

if compose ps --status running --services 2>/dev/null | grep -qx 'backend'; then
  BACKEND_WAS_RUNNING=true
  echo "[restore] Arrêt temporaire du backend..."
  compose stop --timeout 20 backend >/dev/null
fi

SWAP_STARTED=true
psql_admin \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"
psql_admin -c "ALTER DATABASE \"$DB_NAME\" RENAME TO \"$OLD_DB\";"
psql_admin -c "ALTER DATABASE \"$TEMP_DB\" RENAME TO \"$DB_NAME\";"
SWAP_COMPLETED=true

psql_admin \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$OLD_DB' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE \"$OLD_DB\";"

if [[ "$BACKEND_WAS_RUNNING" == true ]]; then
  compose start backend >/dev/null
  BACKEND_WAS_RUNNING=false
fi

trap - EXIT INT TERM
echo "[restore] Restauration validée et basculée avec succès."
