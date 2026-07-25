#!/usr/bin/env bash
# Vérifie les invariants de sécurité de la topologie Compose réellement déployée
# (base + host-proxy + registry) : réseaux corrects, publications strictement
# limitées au loopback, PostgreSQL jamais publié, images backend/frontend
# épinglées par digest. Purement statique : `docker compose config`, aucun
# conteneur démarré.
#
# Usage : ./scripts/verify-compose-topology.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Valeurs factices : on ne fait que rendre la config, jamais démarrer quoi que
# ce soit. Un digest bidon suffit pour valider la topologie.
export POSTGRES_PASSWORD="topology_check_password_at_least_32ch"
export DATABASE_URL="postgres://sentinel:x@postgres:5432/sentinel"
export COOKIE_SECRET="topology_check_cookie_secret_32_chars_ok"
export JWT_SECRET="topology_check_jwt_secret_32_characters_"
export CLIENT_ORIGIN="https://sentinel.example.test"
# shellcheck disable=SC2016 # hash bcrypt factice, jamais destiné à être interpolé
export BOARD_ACCESS_CODE_HASH='$2b$10$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab'
export TRUST_PROXY="true"
export BUILD_SHA="0000000000000000000000000000000000000000"
export CADDY_DOMAIN="sentinel.example.test"
export SENTINEL_BACKEND_BIND_PORT="13000"
export SENTINEL_FRONTEND_BIND_PORT="18080"
export SENTINEL_BACKEND_IMAGE="ghcr.io/example/backend@sha256:0000000000000000000000000000000000000000000000000000000000000000"
export SENTINEL_FRONTEND_IMAGE="ghcr.io/example/frontend@sha256:0000000000000000000000000000000000000000000000000000000000000000"

CONFIG_JSON="$(docker compose \
  -f docker-compose.yml \
  -f docker-compose.host-proxy.example.yml \
  -f docker-compose.registry.example.yml \
  config --format json)"

FAIL=0
check() {
  local label="$1" expr="$2" expected="$3"
  local actual
  actual="$(echo "$CONFIG_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print($expr)")"
  if [[ "$actual" == "$expected" ]]; then
    echo "[topology] OK: $label"
  else
    echo "[topology] FAIL: $label (attendu '$expected', obtenu '$actual')" >&2
    FAIL=1
  fi
}

# Réseaux : backend et frontend doivent joindre internal ET edge.
check "backend rejoint edge+internal" \
  "','.join(sorted(d['services']['backend']['networks']))" "edge,internal"
check "frontend rejoint edge+internal" \
  "','.join(sorted(d['services']['frontend']['networks']))" "edge,internal"
# PostgreSQL reste strictement interne.
check "postgres reste sur internal seul" \
  "','.join(sorted(d['services']['postgres']['networks']))" "internal"

# Publications : backend et frontend uniquement sur le loopback.
check "backend publié uniquement sur 127.0.0.1" \
  "all(p.get('host_ip')=='127.0.0.1' for p in d['services']['backend'].get('ports',[])) and len(d['services']['backend'].get('ports',[]))==1" "True"
check "frontend publié uniquement sur 127.0.0.1" \
  "all(p.get('host_ip')=='127.0.0.1' for p in d['services']['frontend'].get('ports',[])) and len(d['services']['frontend'].get('ports',[]))==1" "True"
# PostgreSQL ne doit JAMAIS être publié sur l'hôte.
check "postgres n'expose aucun port hôte" \
  "len(d['services']['postgres'].get('ports',[]))" "0"

# Images backend/frontend épinglées par digest (sha256), pas par tag mutable.
check "backend épinglé par digest" \
  "'@sha256:' in d['services']['backend'].get('image','')" "True"
check "frontend épinglé par digest" \
  "'@sha256:' in d['services']['frontend'].get('image','')" "True"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "[topology] Tous les invariants de topologie sont respectés."
else
  echo "[topology] Des invariants de topologie sont violés." >&2
fi
exit "$FAIL"
