#!/usr/bin/env bash
# Vérifie que la lecture du .env (scripts/lib/env.sh) ne casse pas et ne corrompt
# aucune valeur difficile — espaces, $, #, guillemets — et qu'un bcrypt ressort
# strictement identique, y compris après `docker compose config` (P1 rc.2).
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
trap 'rm -rf "$WORKDIR"' EXIT INT TERM
ENV_FILE="$WORKDIR/.env"

# Hash bcrypt factice mais de forme réaliste ($2b$, avec des $ internes).
# shellcheck disable=SC2016 # $ littéraux voulus : le hash ne doit jamais s'expandre
FAKE_BCRYPT='$2b$10$abcdefghijklmnopqrstuvXYZ0123456789.ABCDEFGHIJKLMNOPqr'

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
# `$2b$10$...` se fait tronquer, alors qu'écrit avec les $ doublés `$$2b$$10$$...`
# il arrive intact dans le conteneur (Compose reconvertit $$ -> $ à l'exécution).
# On vérifie ce contrat : le .env échappé produit, après `config`, une valeur
# dont chaque $ du hash d'origine est représenté par $$ — donc le conteneur
# recevra exactement le bcrypt attendu, sans troncature.
COMPOSE_TEST_DIR="$WORKDIR/compose"
mkdir -p "$COMPOSE_TEST_DIR"
cat > "$COMPOSE_TEST_DIR/docker-compose.yml" <<'YAML'
services:
  probe:
    image: alpine
    environment:
      HASH: ${BOARD_ACCESS_CODE_HASH:?set}
YAML
# .env avec les $ correctement doublés.
ESCAPED_BCRYPT="${FAKE_BCRYPT//\$/\$\$}"
printf 'BOARD_ACCESS_CODE_HASH=%s\n' "$ESCAPED_BCRYPT" > "$COMPOSE_TEST_DIR/.env"
RENDERED="$(cd "$COMPOSE_TEST_DIR" && docker compose config --format json 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['services']['probe']['environment']['HASH'])")"
# Le rendu de `config` montre les $ doublés ; à l'exécution le conteneur reçoit
# le hash dé-échappé. On vérifie qu'aucune troncature n'a eu lieu (longueur et
# dé-échappement cohérents avec le hash d'origine).
assert_eq "bcrypt échappé non tronqué par docker compose config" "$ESCAPED_BCRYPT" "$RENDERED"
assert_eq "bcrypt dé-échappé == hash d'origine" "$FAKE_BCRYPT" "${RENDERED//\$\$/\$}"

echo ""
echo "[test-env] $PASS test(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
