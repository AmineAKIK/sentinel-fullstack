#!/usr/bin/env bash
# Vérifie que la lecture du .env (scripts/lib/env.sh) ne casse pas et ne corrompt
# aucune valeur difficile — espaces, $, #, guillemets — et qu'un bcrypt entre
# quotes simples ressort strictement identique dans le conteneur (P1 rc.2). Le
# probe Compose tourne dans un projet jetable, nettoyé sur succès comme sur échec.
#
# Aucun vrai secret : uniquement des valeurs factices.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/env.sh
source "$SCRIPT_DIR/lib/env.sh"

PASS=0
FAIL=0
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    echo "[test-env] OK: $label"
  else
    FAIL=$((FAIL + 1))
    echo "[test-env] FAIL: $label" >&2
    echo "  attendu : [$expected]" >&2
    echo "  obtenu  : [$actual]" >&2
  fi
}

WORKDIR="$(mktemp -d)"
# Projet Compose jetable et unique pour le probe : sans lui, `docker compose run`
# créerait des ressources (réseau, conteneur) dans un projet déduit du
# répertoire. On les nettoie strictement sur ce projet, sur succès et sur échec.
PROBE_PROJECT="sentinel_envprobe_$$"
cleanup() {
  docker compose -p "$PROBE_PROJECT" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM
ENV_FILE="$WORKDIR/.env"

# Hash bcrypt factice de forme réaliste et de longueur bcrypt exacte (60).
# shellcheck disable=SC2016 # $ littéraux voulus : le hash ne doit jamais s'expandre
FAKE_BCRYPT='$2b$10$abcdefghijklmnopqrstuvXYZ0123456789.ABCDEFGHIJKLMNOPq'

cat > "$ENV_FILE" <<EOF
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=p@ss\$word#stillvalue
BOARD_ACCESS_LABEL=Board atelier
BOARD_ACCESS_LABEL_QUOTED="Board de l'atelier # zone A"
BOARD_ACCESS_CODE_HASH=$FAKE_BCRYPT
TRAILING_COMMENT=value   # un commentaire
export EXPORTED=exported_value
EOF

assert_eq "valeur simple" "sentinel" "$(read_env_var "$ENV_FILE" POSTGRES_DB)"
# shellcheck disable=SC2016 # $ littéral voulu dans la valeur attendue
assert_eq "mot de passe avec \$ et #" 'p@ss$word#stillvalue' "$(read_env_var "$ENV_FILE" POSTGRES_PASSWORD)"
assert_eq "label avec espace" "Board atelier" "$(read_env_var "$ENV_FILE" BOARD_ACCESS_LABEL)"
assert_eq "label quoté avec apostrophe et #" "Board de l'atelier # zone A" "$(read_env_var "$ENV_FILE" BOARD_ACCESS_LABEL_QUOTED)"
assert_eq "bcrypt intact (aucun \$ interpolé)" "$FAKE_BCRYPT" "$(read_env_var "$ENV_FILE" BOARD_ACCESS_CODE_HASH)"
assert_eq "commentaire en fin de ligne retiré" "value" "$(read_env_var "$ENV_FILE" TRAILING_COMMENT)"
assert_eq "variable exportée" "exported_value" "$(read_env_var "$ENV_FILE" EXPORTED)"
assert_eq "variable absente -> vide" "" "$(read_env_var "$ENV_FILE" ABSENTE)"

# Docker Compose interpole les $ non échappés d'un .env : un bcrypt écrit
# `$2b$10$...` sans quotes se fait tronquer. La représentation CANONIQUE, celle
# qui tourne en production, est de l'entourer de QUOTES SIMPLES : Docker Compose
# traite alors la valeur littéralement et le conteneur reçoit le hash intact.
#
# On vérifie le VRAI comportement runtime (pas la sortie de `docker compose
# config`, qui ré-échappe les $ en $$ pour rester ré-injectable et ne reflète
# donc PAS ce que le conteneur reçoit). `docker compose run` exécute réellement
# le service et expose la valeur telle que le processus la voit. L'image de
# probe est versionnée et épinglée au digest OCI vérifié, comme tous les outils
# réellement tirés par les six checks de la CI.
COMPOSE_TEST_DIR="$WORKDIR/compose"
mkdir -p "$COMPOSE_TEST_DIR"
cat > "$COMPOSE_TEST_DIR/docker-compose.yml" <<'YAML'
services:
  probe:
    image: alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40
    environment:
      HASH: ${BOARD_ACCESS_CODE_HASH:?set}
YAML
# .env avec le bcrypt entre quotes simples (représentation canonique).
printf "BOARD_ACCESS_CODE_HASH='%s'\n" "$FAKE_BCRYPT" > "$COMPOSE_TEST_DIR/.env"
# Une variable d'environnement du shell primerait sur le .env (c'est le cas dans
# le job CI containers). On la retire pour tester la valeur du .env seul, telle
# qu'elle serait lue sur un hôte de déploiement. $HASH doit s'expanser DANS le
# conteneur, pas dans le shell hôte — d'où les quotes simples.
# shellcheck disable=SC2016
RUNTIME_HASH="$(cd "$COMPOSE_TEST_DIR" \
  && env -u BOARD_ACCESS_CODE_HASH docker compose -p "$PROBE_PROJECT" run --rm --no-deps --entrypoint sh probe -c 'printf %s "$HASH"' 2>/dev/null)"
# Le conteneur doit recevoir EXACTEMENT le bcrypt : préfixe $2b$, longueur 60,
# tous les $ conservés, aucune quote résiduelle, aucun $$.
assert_eq "bcrypt runtime identique au hash d'origine" "$FAKE_BCRYPT" "$RUNTIME_HASH"
assert_eq "bcrypt runtime commence par \$2b\$" "\$2b\$" "${RUNTIME_HASH:0:4}"
assert_eq "bcrypt runtime a la longueur bcrypt (60)" "60" "${#RUNTIME_HASH}"
assert_eq "bcrypt runtime sans quote résiduelle" "" "$(printf %s "$RUNTIME_HASH" | tr -cd "\"'")"
assert_eq "bcrypt runtime sans \$\$" "0" "$(printf %s "$RUNTIME_HASH" | grep -c '\$\$' || true)"

# Nettoyage explicite du projet jetable + preuve qu'aucune ressource ne subsiste.
docker compose -p "$PROBE_PROJECT" down --volumes --remove-orphans >/dev/null 2>&1 || true
LEFTOVER="$(docker ps -a --filter "label=com.docker.compose.project=$PROBE_PROJECT" -q | wc -l)"
assert_eq "aucune ressource du probe ne subsiste" "0" "$(echo "$LEFTOVER" | tr -d '[:space:]')"

echo ""
echo "[test-env] $PASS test(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
