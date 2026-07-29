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

sha256_file() {
  local output digest
  output="$(sha256sum -- "$1")" || return 1
  # GNU sha256sum préfixe la ligne par "\" lorsque le nom doit être échappé.
  [[ "${output:0:1}" == "\\" ]] && output="${output:1}"
  digest="${output:0:64}"
  [[ "$digest" =~ ^[[:xdigit:]]{64}$ ]] || return 1
  printf '%s' "${digest,,}"
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
command -v sha256sum >/dev/null 2>&1 || { echo "[restore] sha256sum est introuvable." >&2; exit 1; }
gzip -t -- "$BACKUP_FILE"

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  mapfile -t CHECKSUM_LINES < "${BACKUP_FILE}.sha256"
  [[ "${#CHECKSUM_LINES[@]}" -eq 1 ]] || {
    echo "[restore] Refusé : le sidecar SHA-256 doit contenir exactement une entrée." >&2
    exit 1
  }

  CHECKSUM_PATTERN='^([[:xdigit:]]{64})[[:space:]]([ *])(.+)$'
  [[ "${CHECKSUM_LINES[0]}" =~ $CHECKSUM_PATTERN ]] || {
    echo "[restore] Refusé : format du sidecar SHA-256 invalide." >&2
    exit 1
  }
  EXPECTED_CHECKSUM="${BASH_REMATCH[1],,}"
  CHECKSUM_TARGET="${BASH_REMATCH[3]}"
  BACKUP_BASENAME="$(basename -- "$BACKUP_FILE")"
  [[ "$CHECKSUM_TARGET" == "$BACKUP_BASENAME" ]] || {
    echo "[restore] Refusé : le sidecar SHA-256 ne référence pas exactement '$BACKUP_BASENAME'." >&2
    exit 1
  }
  if ! ACTUAL_CHECKSUM="$(sha256_file "$BACKUP_FILE")"; then
    echo "[restore] Impossible de calculer l'empreinte SHA-256 du backup." >&2
    exit 1
  fi
  [[ "$ACTUAL_CHECKSUM" == "$EXPECTED_CHECKSUM" ]] || {
    echo "[restore] Refusé : l'empreinte SHA-256 du backup est invalide." >&2
    exit 1
  }
  echo "$BACKUP_BASENAME: OK"
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

MIGRATIONS_DIR="$PROJECT_ROOT/backend/migrations"
[[ -d "$MIGRATIONS_DIR" ]] || {
  echo "[restore] Répertoire des migrations introuvable." >&2
  exit 1
}
shopt -s nullglob
MIGRATION_FILES=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob
[[ "${#MIGRATION_FILES[@]}" -gt 0 ]] || {
  echo "[restore] Aucune migration canonique trouvée." >&2
  exit 1
}

EXPECTED_LEDGER_ROWS=()
EXPECTED_SEQUENCE=1
for MIGRATION_FILE in "${MIGRATION_FILES[@]}"; do
  MIGRATION_NAME="$(basename -- "$MIGRATION_FILE")"
  printf -v EXPECTED_PREFIX '%03d' "$EXPECTED_SEQUENCE"
  [[ "$MIGRATION_NAME" =~ ^${EXPECTED_PREFIX}_.+\.sql$ ]] || {
    echo "[restore] Séquence de migrations non canonique au rang $EXPECTED_PREFIX." >&2
    exit 1
  }
  if ! MIGRATION_CHECKSUM="$(sha256_file "$MIGRATION_FILE")"; then
    echo "[restore] Impossible de calculer le SHA-256 de '$MIGRATION_NAME'." >&2
    exit 1
  fi
  EXPECTED_LEDGER_ROWS+=("$MIGRATION_NAME"$'\t'"$MIGRATION_CHECKSUM")
  EXPECTED_SEQUENCE=$((EXPECTED_SEQUENCE + 1))
done
EXPECTED_LEDGER="$(printf '%s\n' "${EXPECTED_LEDGER_ROWS[@]}")"

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

if ! ACTUAL_LEDGER="$(compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$DB_USER" -d "$TEMP_DB" --no-password --set=ON_ERROR_STOP=1 -Atq \
    -F $'\t' \
    -c "SELECT filename, checksum
        FROM schema_migrations
        ORDER BY applied_at, filename;" 2>/dev/null)"; then
  echo "[restore] Impossible de lire le ledger de migrations du dump." >&2
  exit 1
fi
[[ "$ACTUAL_LEDGER" == "$EXPECTED_LEDGER" ]] || {
  echo "[restore] Le ledger de migrations ne correspond pas exactement aux migrations du dépôt (noms, ordre ou checksums)." >&2
  mapfile -t ACTUAL_LEDGER_ROWS <<< "$ACTUAL_LEDGER"
  echo "[restore] Ledger attendu : ${#EXPECTED_LEDGER_ROWS[@]} entrée(s) ; dump : ${#ACTUAL_LEDGER_ROWS[@]} entrée(s)." >&2
  for ((LEDGER_INDEX = 0; LEDGER_INDEX < ${#EXPECTED_LEDGER_ROWS[@]}; LEDGER_INDEX += 1)); do
    EXPECTED_ROW="${EXPECTED_LEDGER_ROWS[$LEDGER_INDEX]}"
    ACTUAL_ROW="${ACTUAL_LEDGER_ROWS[$LEDGER_INDEX]:-<absente>}"
    if [[ "$ACTUAL_ROW" != "$EXPECTED_ROW" ]]; then
      echo "[restore] Première divergence au rang $((LEDGER_INDEX + 1)) : attendu '${EXPECTED_ROW%%$'\t'*}', reçu '${ACTUAL_ROW%%$'\t'*}'." >&2
      break
    fi
  done
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
