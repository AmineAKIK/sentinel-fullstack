#!/usr/bin/env bash
# Exercice automatisé de scripts/backup.sh et scripts/restore.sh contre un
# PostgreSQL Docker Compose jetable. Ne touche JAMAIS une base ou un projet
# réel : tout tourne dans un projet Compose jetable et unique
# (COMPOSE_PROJECT_NAME=sentinel_bkrestore_test_$$), détruit à la fin. Le
# nettoyage est strictement limité à ce projet ; une ressource sentinelle
# extérieure est vérifiée intacte en fin de test pour prouver l'isolation.
#
# Usage : ./scripts/test-backup-restore.sh
# Prérequis : Docker Compose v2. Sûr à exécuter depuis /var/www/sentinel : le
# projet de production « sentinel » n'est jamais ciblé. Le service `backend`
# du test est une sentinelle légère : il permet de prouver qu'un rejet de
# restauration intervient avant toute bascule et sans arrêt/redémarrage.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Nom de projet Compose JETABLE et unique. Sans lui, Docker Compose déduit le
# nom du projet du répertoire courant : dans /var/www/sentinel il réutiliserait
# le projet de production « sentinel » et le nettoyage `down --volumes`
# détruirait le volume de production. On l'impose donc explicitement et on
# l'exporte pour que backup.sh/restore.sh (qui utilisent --project-directory)
# héritent du même projet jetable, jamais celui de production.
COMPOSE_PROJECT_NAME="sentinel_bkrestore_test_$$"
export COMPOSE_PROJECT_NAME

# Garde : aucun nom de projet réservé à un environnement réel n'est toléré.
case "$COMPOSE_PROJECT_NAME" in
  sentinel | production | sentinel_prod | staging)
    echo "[test-backup-restore] Nom de projet interdit : $COMPOSE_PROJECT_NAME" >&2
    exit 2
    ;;
esac

# Composition entièrement jetable. Le faux service `backend` réutilise l'image
# PostgreSQL déjà nécessaire au test, épinglée au même digest OCI que la CI ; il
# ne contient ni code Sentinel ni connexion à la base et ne sert qu'à observer
# les arrêts/redémarrages.
WORKDIR="$(mktemp -d)"
TEST_COMPOSE_FILE="$WORKDIR/docker-compose.test.yml"
cat > "$TEST_COMPOSE_FILE" <<'YAML'
services:
  postgres:
    image: postgres:15.18-alpine3.23@sha256:3889f6e66267065437b17a404058a6220d9080c73b701edd225770f8b2d6a52c
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    image: postgres:15.18-alpine3.23@sha256:3889f6e66267065437b17a404058a6220d9080c73b701edd225770f8b2d6a52c
    command: ['tail', '-f', '/dev/null']

volumes:
  postgres_data:
YAML
export COMPOSE_FILE="$TEST_COMPOSE_FILE"

# Toutes les commandes Compose du test passent par ce wrapper, qui ré-impose le
# projet jetable via -p (double sécurité avec COMPOSE_PROJECT_NAME).
dc() {
  docker compose \
    --project-directory "$PROJECT_ROOT" \
    -p "$COMPOSE_PROJECT_NAME" \
    -f "$TEST_COMPOSE_FILE" \
    "$@"
}

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

backend_started_at() {
  local container_id
  container_id="$(dc ps -q backend)"
  [[ -n "$container_id" ]] || return 1
  docker inspect --format '{{.State.StartedAt}}' "$container_id"
}

database_scalar() {
  local sql="$1"
  dc exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -v ON_ERROR_STOP=1 -c "$sql"
}

repair_test_database_state() {
  dc exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 \
      -c "TRUNCATE schema_migrations;" \
      -c "CREATE TABLE IF NOT EXISTS rc5_restore_guard (token text NOT NULL);" \
      -c "TRUNCATE rc5_restore_guard;" \
      -c "INSERT INTO rc5_restore_guard(token) VALUES ('production-intact');" \
    >/dev/null

  local migration_file migration_name migration_checksum migration_sequence
  while IFS= read -r migration_file; do
    migration_name="$(basename "$migration_file")"
    migration_checksum="$(sha256sum "$migration_file" | cut -d' ' -f1)"
    migration_sequence="${migration_name%%_*}"
    dc exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 \
        -c "INSERT INTO schema_migrations(filename, checksum, applied_at)
            VALUES (
              '$migration_name',
              '$migration_checksum',
              TIMESTAMPTZ '2000-01-01 00:00:00+00'
                + $((10#$migration_sequence)) * INTERVAL '1 second'
            );" \
      >/dev/null
  done < <(find backend/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' | sort)
}

create_ledger_variant() {
  local label="$1" mutation_sql="$2"
  local variant_db="${POSTGRES_DB}_variant_${label}"
  local variant_file="$BACKUP_DIR/sentinel_backup_${label}.sql.gz"

  dc exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -q -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"$variant_db\";" \
      -c "CREATE DATABASE \"$variant_db\" OWNER \"$POSTGRES_USER\";" \
    >/dev/null
  gunzip -c "$BACKUP_FILE" \
    | dc exec -T postgres \
        psql -U "$POSTGRES_USER" -d "$variant_db" -q -v ON_ERROR_STOP=1 \
          --single-transaction \
        >/dev/null
  dc exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$variant_db" -q -v ON_ERROR_STOP=1 \
      -c "$mutation_sql" \
    >/dev/null
  dc exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$variant_db" --no-owner --no-privileges \
    | gzip -9 > "$variant_file"
  (
    cd "$BACKUP_DIR"
    sha256sum "$(basename "$variant_file")" > "$(basename "$variant_file").sha256"
  )
  dc exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -q -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE \"$variant_db\";" \
    >/dev/null
  printf '%s' "$variant_file"
}

expect_restore_rejected_before_mutation() {
  local label="$1" restore_file="$2" expected_error="${3:-}"
  local db_oid_before ledger_before guard_before backend_before
  local db_oid_after ledger_after guard_after backend_after transient_count
  local output rc

  db_oid_before="$(database_scalar "SELECT oid FROM pg_database WHERE datname = current_database();")"
  ledger_before="$(database_scalar "SELECT md5(string_agg(filename || ':' || checksum, ',' ORDER BY filename)) FROM schema_migrations;")"
  guard_before="$(database_scalar "SELECT token FROM rc5_restore_guard;")"
  backend_before="$(backend_started_at)"

  set +e
  output="$(printf '%s\n' "$POSTGRES_DB" | bash scripts/restore.sh "$restore_file" 2>&1)"
  rc=$?
  set -e

  db_oid_after="$(database_scalar "SELECT oid FROM pg_database WHERE datname = current_database();")"
  ledger_after="$(database_scalar "SELECT md5(string_agg(filename || ':' || checksum, ',' ORDER BY filename)) FROM schema_migrations;")"
  guard_after="$(database_scalar "SELECT token FROM rc5_restore_guard;" 2>/dev/null || true)"
  backend_after="$(backend_started_at)"
  transient_count="$(dc exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -Atq -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM pg_database
          WHERE datname LIKE '${POSTGRES_DB}_restore_%'
             OR datname LIKE '${POSTGRES_DB}_before_%';")"

  if [[ "$rc" -ne 0 \
     && ( -z "$expected_error" || "$output" == *"$expected_error"* ) \
     && "$db_oid_after" == "$db_oid_before" \
     && "$ledger_after" == "$ledger_before" \
     && "$guard_before" == "production-intact" \
     && "$guard_after" == "$guard_before" \
     && "$backend_after" == "$backend_before" \
     && "$transient_count" == "0" ]] \
     && dc ps --status running --services | grep -qx backend; then
    ok "$label : rejet avant mutation, backend non redémarré"
  else
    fail "$label : restauration acceptée ou état de production/backend modifié"
    printf '%s\n' "$output" | tail -8 >&2
    printf '[test-backup-restore] rc=%s motif_attendu=%q oid=%s→%s ledger=%s→%s guard=%s→%s backend=%s→%s temporaires=%s\n' \
      "$rc" "$expected_error" \
      "$db_oid_before" "$db_oid_after" "$ledger_before" "$ledger_after" \
      "$guard_before" "$guard_after" "$backend_before" "$backend_after" "$transient_count" >&2
  fi

  # Le rouge peut avoir basculé un variant invalide. Répare uniquement la base
  # jetable afin que tous les scénarios permanents s'exécutent et échouent
  # indépendamment avant la correction.
  repair_test_database_state
}

# Ressource « sentinelle » extérieure au projet de test : un volume Docker
# nommé, hors du projet jetable. Il simule une ressource de production. Si le
# nettoyage `down --volumes` du test le supprimait, c'est que le projet ciblé
# n'est pas correctement isolé. On vérifie en fin de test qu'il est intact.
SENTINEL_VOLUME="sentinel_bkrestore_sentinel_$$"

cleanup() {
  local code=$?
  if [[ "$code" -ne 0 ]]; then
    echo "[test-backup-restore] Échec (code $code) — logs PostgreSQL :" >&2
    dc logs postgres >&2 || true
  fi
  # Nettoyage STRICTEMENT limité au projet jetable de ce test.
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  # La sentinelle est nettoyée à part, explicitement par son nom.
  docker volume rm "$SENTINEL_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "[test-backup-restore] Installation de la ressource sentinelle externe..."
docker volume create "$SENTINEL_VOLUME" >/dev/null

echo "[test-backup-restore] Démarrage de PostgreSQL jetable..."
dc up -d postgres >/dev/null
READY=false
for _ in $(seq 1 60); do
  if dc exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 2
done
if [[ "$READY" != true ]]; then
  echo "[test-backup-restore] PostgreSQL n'est pas devenu prêt à temps. Diagnostic :" >&2
  dc ps postgres >&2 || true
  dc logs postgres >&2 || true
  exit 1
fi

echo "[test-backup-restore] Démarrage de la sentinelle backend jetable..."
dc up -d backend >/dev/null
if dc ps --status running --services | grep -qx backend; then
  ok "la sentinelle backend est active avant les restaurations"
else
  echo "[test-backup-restore] La sentinelle backend n'est pas active." >&2
  exit 1
fi

echo "[test-backup-restore] Chargement du schéma réel (migrations SQL brutes)..."
while IFS= read -r f; do
  dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
    < "$f" >/dev/null
done < <(find backend/migrations -maxdepth 1 -name '*.sql' | sort)
dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR PRIMARY KEY, checksum VARCHAR(64), applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" >/dev/null
for f in backend/migrations/*.sql; do
  base="$(basename "$f")"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  sequence="${base%%_*}"
  dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
    -c "INSERT INTO schema_migrations (filename, checksum, applied_at)
        VALUES (
          '$base',
          '$sum',
          TIMESTAMPTZ '2000-01-01 00:00:00+00'
            + $((10#$sequence)) * INTERVAL '1 second'
        );" >/dev/null
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
if gzip -t "$BACKUP_FILE" \
   && (cd "$BACKUP_DIR" && sha256sum -c "$(basename "${BACKUP_FILE}.sha256")" >/dev/null); then
  ok "le dump nominal est valide et son sidecar authentifie le bon fichier"
else
  fail "le dump nominal ou son sidecar est invalide"
fi

# --- Scénario 2 : restauration nominale, bascule réelle des données --------
echo "[test-backup-restore] Scénario 2 : restauration nominale."
dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "DELETE FROM schema_migrations WHERE filename = '001_deleted_after_backup.sql';" >/dev/null 2>&1 || true
dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('999_marker_before_restore.sql', repeat('a', 64));" >/dev/null
BACKEND_BEFORE_SUCCESS="$(backend_started_at)"
RESTORE_START="$(date +%s)"
set +e
NOMINAL_RESTORE_OUTPUT="$(printf '%s\n' "$POSTGRES_DB" | bash scripts/restore.sh "$BACKUP_FILE" 2>&1)"
NOMINAL_RESTORE_RC=$?
set -e
if [[ "$NOMINAL_RESTORE_RC" -eq 0 ]]; then
  RESTORE_ELAPSED="$(( $(date +%s) - RESTORE_START ))"
  ok "restore.sh réussit contre une base réelle (RTO mesuré : ${RESTORE_ELAPSED}s)"
else
  fail "restore.sh a échoué en conditions nominales"
  printf '%s\n' "$NOMINAL_RESTORE_OUTPUT" | tail -12 >&2
fi
BACKEND_AFTER_SUCCESS="$(backend_started_at 2>/dev/null || true)"
if [[ -n "$BACKEND_AFTER_SUCCESS" \
   && "$BACKEND_AFTER_SUCCESS" != "$BACKEND_BEFORE_SUCCESS" ]] \
   && dc ps --status running --services | grep -qx backend; then
  ok "la restauration complète redémarre le backend après la bascule"
else
  fail "la restauration complète n'a pas effectué le cycle d'arrêt/redémarrage attendu"
fi
MARKER_GONE="$(dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq \
  -c "SELECT count(*) FROM schema_migrations WHERE filename = '999_marker_before_restore.sql';")"
if [[ "$(echo "$MARKER_GONE" | tr -d '[:space:]')" == "0" ]]; then
  ok "la restauration a bien remplacé l'état post-backup"
else
  fail "la marque insérée après le backup est encore présente : la restauration n'a pas basculé"
fi
LEDGER_COUNT="$(database_scalar "SELECT count(*) FROM schema_migrations;")"
if [[ "$LEDGER_COUNT" == "50" ]]; then
  ok "la restauration nominale conserve le ledger canonique 001..050"
else
  fail "la restauration nominale contient $LEDGER_COUNT migrations au lieu de 50"
fi

# État témoin utilisé par tous les rejets suivants. L'OID, ce contenu, le
# ledger et l'instant de démarrage du backend doivent rester strictement
# identiques après chaque tentative invalide.
repair_test_database_state

# --- Scénario 3 : intégrité du fichier et liaison stricte du sidecar --------
echo "[test-backup-restore] Scénario 3 : intégrité du dump et liaison du sidecar."
BAD_HASH_FILE="$BACKUP_DIR/sentinel_backup_bad_hash.sql.gz"
cp "$BACKUP_FILE" "$BAD_HASH_FILE"
printf '%064d  %s\n' 0 "$(basename "$BAD_HASH_FILE")" > "${BAD_HASH_FILE}.sha256"
expect_restore_rejected_before_mutation \
  "un hash incorrect est refusé" \
  "$BAD_HASH_FILE"

WRONG_TARGET_FILE="$BACKUP_DIR/sentinel_backup_sidecar_other_file.sql.gz"
cp "$BACKUP_FILE" "$WRONG_TARGET_FILE"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$BACKUP_FILE")" > "$(basename "$WRONG_TARGET_FILE").sha256"
)
expect_restore_rejected_before_mutation \
  "un sidecar qui nomme un autre fichier est refusé" \
  "$WRONG_TARGET_FILE" \
  "ne référence pas exactement"

# --- Scénario 4 : ledger exact, complet, ordonné et intègre -----------------
echo "[test-backup-restore] Scénario 4 : contrat exact du ledger 001..050."
TRUNCATED_FILE="$(create_ledger_variant \
  "ledger_001_043" \
  "DELETE FROM schema_migrations WHERE substring(filename from 1 for 3)::int > 43;")"
expect_restore_rejected_before_mutation \
  "un ledger tronqué à 001..043 est refusé" \
  "$TRUNCATED_FILE" \
  "ne correspond pas exactement"

MISSING_FILE="$(create_ledger_variant \
  "ledger_missing" \
  "DELETE FROM schema_migrations WHERE filename = '025_audit_target_identity_snapshot.sql';")"
expect_restore_rejected_before_mutation \
  "un ledger auquel il manque une migration est refusé" \
  "$MISSING_FILE" \
  "ne correspond pas exactement"

EXTRA_FILE="$(create_ledger_variant \
  "ledger_extra" \
  "INSERT INTO schema_migrations(filename, checksum) VALUES ('051_unexpected.sql', repeat('a', 64));")"
expect_restore_rejected_before_mutation \
  "un ledger contenant une migration supplémentaire est refusé" \
  "$EXTRA_FILE" \
  "ne correspond pas exactement"

OUT_OF_ORDER_FILE="$(create_ledger_variant \
  "ledger_out_of_order" \
  "UPDATE schema_migrations
     SET applied_at = (SELECT min(applied_at) - interval '1 day' FROM schema_migrations)
   WHERE filename = '050_model_waiting_reason_separately_from_diagnostic.sql';")"
expect_restore_rejected_before_mutation \
  "un ledger dont l'ordre d'application est falsifié est refusé" \
  "$OUT_OF_ORDER_FILE" \
  "ne correspond pas exactement"

BAD_CHECKSUM_FILE="$(create_ledger_variant \
  "ledger_bad_checksum" \
  "UPDATE schema_migrations
      SET checksum = repeat('f', 64)
    WHERE filename = '025_audit_target_identity_snapshot.sql';")"
expect_restore_rejected_before_mutation \
  "un checksum de migration modifié est refusé" \
  "$BAD_CHECKSUM_FILE" \
  "ne correspond pas exactement"

# --- Scénario 5 : exclusion mutuelle backup/restore -------------------------
echo "[test-backup-restore] Scénario 5 : exclusion mutuelle."
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

# --- Scénario 6 : refus par défaut sans checksum, --allow-unverified -------
echo "[test-backup-restore] Scénario 6 : checksum obligatoire."
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

# --- Scénario 7 : rejet d'un dump hors schéma Sentinel ----------------------
echo "[test-backup-restore] Scénario 7 : validation de schéma (OPS-03)."
dc exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE DATABASE sentinel_ci_bogus;" >/dev/null
dc exec -T postgres psql -U "$POSTGRES_USER" -d sentinel_ci_bogus -v ON_ERROR_STOP=1 -q \
  -c "CREATE TABLE not_a_sentinel_table (id serial primary key);" >/dev/null
BOGUS_FILE="$BACKUP_DIR/sentinel_backup_bogus.sql.gz"
dc exec -T postgres pg_dump -U "$POSTGRES_USER" -d sentinel_ci_bogus --no-owner --no-privileges \
  | gzip -9 > "$BOGUS_FILE"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$BOGUS_FILE")" > "$(basename "$BOGUS_FILE").sha256")
dc exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE sentinel_ci_bogus;" >/dev/null

expect_restore_rejected_before_mutation \
  "un dump hors schéma Sentinel est refusé" \
  "$BOGUS_FILE" \
  "tables attendues"

# --- Scénario 8 : isolation prouvée — la ressource externe survit -----------
echo "[test-backup-restore] Scénario 8 : isolation du projet jetable."
if docker volume inspect "$SENTINEL_VOLUME" >/dev/null 2>&1; then
  ok "une ressource Docker hors du projet de test reste intacte (isolation prouvée)"
else
  fail "la ressource sentinelle externe a disparu : le test n'est pas isolé"
fi

echo ""
echo "[test-backup-restore] $PASS scénario(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
