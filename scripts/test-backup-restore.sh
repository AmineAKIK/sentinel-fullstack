#!/usr/bin/env bash
# Exercice automatisé de scripts/backup.sh et scripts/restore.sh contre un
# PostgreSQL Docker Compose jetable. Ne touche jamais une base réelle : tout
# tourne sous POSTGRES_DB=sentinel_ci_test, détruit à la fin.
#
# Usage : ./scripts/test-backup-restore.sh
# Prérequis : Docker Compose v2, aucun autre projet Compose nommé "sentinel"
# en conflit sur le réseau/volume utilisés (le script les nettoie lui-même).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

export POSTGRES_DB="sentinel_ci_test"
export POSTGRES_USER="sentinel"
export POSTGRES_PASSWORD="ci_test_password_1234567890"
export DATABASE_URL="postgres://sentinel:ci_test_password_1234567890@postgres:5432/sentinel_ci_test"
# shellcheck disable=SC2016 # hash bcrypt factice, jamais destiné à être interpolé
export BOARD_ACCESS_CODE_HASH='$2b$10$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab'
export BUILD_SHA="0000000000000000000000000000000000000000"
export CADDY_DOMAIN="ci-test.local"
export CLIENT_ORIGIN="http://127.0.0.1:5173"
export COOKIE_SECRET="ci_test_cookie_secret_with_32_characters_min"
export JWT_SECRET="ci_test_jwt_secret_with_32_characters_min____"
export TRUST_PROXY="false"

WORKDIR="$(mktemp -d)"
BACKUP_DIR="$WORKDIR/backups"
mkdir -p "$BACKUP_DIR"
export BACKUP_DIR

PASS=0
FAIL=0

ok() {
  PASS=$((PASS + 1))
  echo "[test-backup-restore] OK: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo "[test-backup-restore] FAIL: $1" >&2
}

cleanup() {
  local code=$?
  docker compose down postgres --volumes >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "[test-backup-restore] Démarrage de PostgreSQL jetable..."
docker compose up -d postgres >/dev/null
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null

echo "[test-backup-restore] Chargement du schéma réel (migrations SQL brutes)..."
while IFS= read -r f; do
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
    < "$f" >/dev/null
done < <(find backend/migrations -maxdepth 1 -name '*.sql' | sort)
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR PRIMARY KEY, checksum VARCHAR(64), applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" >/dev/null
for f in backend/migrations/*.sql; do
  base="$(basename "$f")"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
    -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$base', '$sum');" >/dev/null
done

# --- Scénario 1 : sauvegarde nominale ---------------------------------------
echo "[test-backup-restore] Scénario 1 : sauvegarde nominale."
if bash scripts/backup.sh >/dev/null 2>&1; then
  ok "backup.sh réussit contre une base réelle"
else
  fail "backup.sh a échoué en conditions nominales"
fi
BACKUP_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -name 'sentinel_backup_*.sql.gz' -printf '%T@ %p\n' \
  | sort -rn | head -1 | cut -d' ' -f2-)"
if [[ -f "$BACKUP_FILE" && -f "${BACKUP_FILE}.sha256" ]]; then
  ok "backup + checksum présents sur disque"
else
  fail "fichier de sauvegarde ou checksum manquant"
fi

# --- Scénario 2 : restauration nominale, bascule réelle des données --------
echo "[test-backup-restore] Scénario 2 : restauration nominale."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "DELETE FROM schema_migrations WHERE filename = '001_deleted_after_backup.sql';" >/dev/null 2>&1 || true
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('999_marker_before_restore.sql', repeat('a', 64));" >/dev/null
if echo "$POSTGRES_DB" | bash scripts/restore.sh "$BACKUP_FILE" >/dev/null 2>&1; then
  ok "restore.sh réussit contre une base réelle"
else
  fail "restore.sh a échoué en conditions nominales"
fi
MARKER_GONE="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq \
  -c "SELECT count(*) FROM schema_migrations WHERE filename = '999_marker_before_restore.sql';")"
if [[ "$(echo "$MARKER_GONE" | tr -d '[:space:]')" == "0" ]]; then
  ok "la restauration a bien remplacé l'état post-backup"
else
  fail "la marque insérée après le backup est encore présente : la restauration n'a pas basculé"
fi

# --- Scénario 3 : exclusion mutuelle backup/restore -------------------------
echo "[test-backup-restore] Scénario 3 : exclusion mutuelle."
(
  exec 9>"$BACKUP_DIR/.sentinel-backup.lock"
  flock 9
  sleep 8
) &
HOLD_PID=$!
sleep 1
if echo "$POSTGRES_DB" | bash scripts/restore.sh "$BACKUP_FILE" >/dev/null 2>&1; then
  fail "restore.sh a démarré alors qu'un verrou était tenu"
else
  ok "restore.sh refuse de démarrer sous verrou tenu (OPS-01)"
fi
wait "$HOLD_PID"

(
  exec 9>"$BACKUP_DIR/.sentinel-backup.lock"
  flock 9
  sleep 8
) &
HOLD_PID=$!
sleep 1
if bash scripts/backup.sh >/dev/null 2>&1; then
  fail "backup.sh a démarré alors qu'un verrou était tenu"
else
  ok "backup.sh refuse de démarrer sous verrou tenu (OPS-01, sens inverse)"
fi
wait "$HOLD_PID"

# --- Scénario 4 : refus par défaut sans checksum, --allow-unverified -------
echo "[test-backup-restore] Scénario 4 : checksum obligatoire."
NO_SUM_FILE="$BACKUP_DIR/sentinel_backup_no_checksum.sql.gz"
cp "$BACKUP_FILE" "$NO_SUM_FILE"
if echo "$POSTGRES_DB" | bash scripts/restore.sh "$NO_SUM_FILE" >/dev/null 2>&1; then
  fail "restore.sh a accepté un dump sans checksum par défaut"
else
  ok "restore.sh refuse un dump sans checksum par défaut (OPS-02)"
fi
if echo "not-the-real-db-name" | bash scripts/restore.sh --allow-unverified "$NO_SUM_FILE" >/dev/null 2>&1; then
  ok "--allow-unverified franchit la porte checksum (arrêt propre à la confirmation)"
else
  fail "--allow-unverified n'a pas permis de dépasser la porte checksum"
fi

# --- Scénario 5 : rejet d'un dump hors schéma Sentinel ----------------------
echo "[test-backup-restore] Scénario 5 : validation de schéma (OPS-03)."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE DATABASE sentinel_ci_bogus;" >/dev/null
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d sentinel_ci_bogus -v ON_ERROR_STOP=1 -q \
  -c "CREATE TABLE not_a_sentinel_table (id serial primary key);" >/dev/null
BOGUS_FILE="$BACKUP_DIR/sentinel_backup_bogus.sql.gz"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d sentinel_ci_bogus --no-owner --no-privileges \
  | gzip -9 > "$BOGUS_FILE"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$BOGUS_FILE")" > "$(basename "$BOGUS_FILE").sha256")
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE sentinel_ci_bogus;" >/dev/null

if echo "$POSTGRES_DB" | bash scripts/restore.sh "$BOGUS_FILE" >/dev/null 2>&1; then
  fail "restore.sh a accepté un dump hors schéma Sentinel"
else
  ok "restore.sh rejette un dump hors schéma Sentinel (OPS-03)"
fi
STILL_INTACT="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq \
  -c "SELECT count(*) FROM schema_migrations;")"
if [[ "$(echo "$STILL_INTACT" | tr -d '[:space:]')" -gt "0" ]]; then
  ok "la base réelle reste intacte après un rejet de validation"
else
  fail "la base réelle semble avoir été affectée par une restauration rejetée"
fi

echo ""
echo "[test-backup-restore] $PASS scénario(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
