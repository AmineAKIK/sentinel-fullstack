#!/usr/bin/env bash
# restore.sh — Restauration de la base PostgreSQL Sentinel depuis un backup
#
# Usage:
#   ./scripts/restore.sh <fichier_backup.sql.gz>
#
# Variables d'environnement (lues depuis .env si présent) :
#   POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
#
# ATTENTION : cette opération supprime et recrée la base de données.
# Toutes les données existantes seront ÉCRASÉES.

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

# ── Paramètres ────────────────────────────────────────────────────────────────
DB_NAME="${POSTGRES_DB:-sentinel}"
DB_USER="${POSTGRES_USER:-sentinel}"
CONTAINER="${POSTGRES_CONTAINER:-sentinel_postgres}"

# ── Argument obligatoire ──────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage : $0 <fichier_backup.sql.gz>" >&2
  echo ""
  echo "Fichiers disponibles dans ./backups :"
  ls -lht "$PROJECT_ROOT/backups/"sentinel_backup_*.sql.gz 2>/dev/null || echo "  (aucun)"
  exit 1
fi

BACKUP_FILE="$1"

# ── Vérifications préalables ──────────────────────────────────────────────────
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[restore] ERREUR : fichier introuvable : $BACKUP_FILE" >&2
  exit 1
fi

if [[ ! -r "$BACKUP_FILE" ]]; then
  echo "[restore] ERREUR : fichier non lisible : $BACKUP_FILE" >&2
  exit 1
fi

# Vérifier que c'est bien un gzip valide
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "[restore] ERREUR : le fichier n'est pas un archive gzip valide." >&2
  exit 1
fi

if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q 'true'; then
  echo "[restore] ERREUR : le conteneur '$CONTAINER' n'est pas en cours d'exécution." >&2
  exit 1
fi

# ── Confirmation interactive ──────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║           RESTAURATION SENTINEL — ATTENTION          ║"
echo "  ╠══════════════════════════════════════════════════════╣"
echo "  ║  Backup    : $(basename "$BACKUP_FILE")"
echo "  ║  Base      : $DB_NAME"
echo "  ║  Conteneur : $CONTAINER"
echo "  ╠══════════════════════════════════════════════════════╣"
echo "  ║  Toutes les données existantes seront ÉCRASÉES.      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
read -r -p "  Confirmer la restauration ? [oui/NON] " CONFIRM

if [[ "$CONFIRM" != "oui" ]]; then
  echo "[restore] Annulé."
  exit 0
fi

echo ""
echo "[restore] Démarrage — $(date)"
echo "[restore] Fichier : $BACKUP_FILE"

# ── Drop & recréer la base ────────────────────────────────────────────────────
echo "[restore] Suppression de la base existante..."
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" \
  psql -U "$DB_USER" -d postgres --no-password \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" \
  -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" \
  -q

echo "[restore] Base recréée. Import du dump en cours..."

# ── Restauration ──────────────────────────────────────────────────────────────
if gunzip -c "$BACKUP_FILE" \
  | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" \
      psql -U "$DB_USER" -d "$DB_NAME" --no-password -q; then
  echo "[restore] Succès — base '$DB_NAME' restaurée depuis $(basename "$BACKUP_FILE")"
  echo "[restore] Terminé — $(date)"
else
  echo "[restore] ERREUR : la restauration a échoué." >&2
  exit 1
fi
