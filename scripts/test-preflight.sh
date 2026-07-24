#!/usr/bin/env bash
# Exercice automatisé de scripts/preflight.sh. Construit l'image backend (qui
# contient le checker de configuration de production), la référence par son
# digest LOCAL, et lance le préflight sur une matrice de fichiers .env : un cas
# valide fourni uniquement par .env (BUILD_SHA absent du shell, comme sur le VPS
# après reconnexion SSH) et une série de cas invalides que le préflight DOIT
# refuser. Vérifie aussi qu'aucun secret n'apparaît sur stdout/stderr.
#
# Aucun secret réel : uniquement des valeurs factices.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Secrets factices reconnaissables, pour prouver qu'ils ne fuient jamais.
STRONG_DB='FAKE_db_password_of_at_least_32_characters'
COOKIE='FAKE_cookie_secret_with_at_least_32_chars'
JWT='FAKE_jwt_secret_distinct_and_32_chars_long'
BCRYPT_OK="\$2b\$10\$nUd3TqHyISvb.aORRwqoQOXRMva5G3a2a7ks7SUCbh2DWhRTuGRRu"
BUILD_SHA_OK='c57b1f860f083a5318c8314ccf43f760a5624dce'

PASS=0
FAIL=0
ok() {
  PASS=$((PASS + 1))
  echo "[test-preflight] OK: $1"
}
bad() {
  FAIL=$((FAIL + 1))
  echo "[test-preflight] FAIL: $1" >&2
}

WORKDIR="$(mktemp -d)"
# Registre local jetable : le préflight, comme le déploiement réel, exige des
# images épinglées par digest @sha256:. Un digest de manifeste n'existe QUE pour
# une image poussée vers un registre. On ne peut PAS se reposer sur
# `.RepoDigests` d'une image seulement buildée : il n'est peuplé que par le
# magasin d'images containerd (Docker Desktop local), pas par le magasin
# classique des runners GitHub — d'où l'échec CI. On pousse donc l'image vers un
# registre local éphémère (loopback) pour obtenir un digest RÉEL, reproductible
# sur tout magasin d'images.
REGISTRY_NAME="preflight-registry-$$"
REGISTRY_PORT=5099
REGISTRY_HOST="127.0.0.1:${REGISTRY_PORT}"
cleanup() {
  docker rm -f "$REGISTRY_NAME" >/dev/null 2>&1 || true
  rm -f "$PROJECT_ROOT/.env.test-preflight" "$PROJECT_ROOT/.env"
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

echo "[test-preflight] Construction de l'image backend (checker inclus)..."
docker build --build-arg BUILD_SHA="$BUILD_SHA_OK" --tag sentinel-backend:preflight-test ./backend >/dev/null 2>&1

echo "[test-preflight] Démarrage d'un registre local jetable pour obtenir un digest réel..."
docker rm -f "$REGISTRY_NAME" >/dev/null 2>&1 || true
docker run -d --name "$REGISTRY_NAME" -p "${REGISTRY_HOST}:5000" registry:2 >/dev/null 2>&1
# Attendre que le registre réponde (au plus ~15 s).
REGISTRY_READY=0
for _ in $(seq 1 15); do
  if curl -sf "http://${REGISTRY_HOST}/v2/" >/dev/null 2>&1; then REGISTRY_READY=1; break; fi
  sleep 1
done
if [[ "$REGISTRY_READY" -ne 1 ]]; then
  echo "[test-preflight] Le registre local n'a pas démarré — impossible de tester le déploiement par digest." >&2
  exit 1
fi

# Pousse l'image de test vers le registre local ; le digest imprimé par le push
# est le digest de manifeste RÉEL, valable pour un run/pull sur tout magasin.
LOCAL_REF="${REGISTRY_HOST}/sentinel-backend:preflight-test"
docker tag sentinel-backend:preflight-test "$LOCAL_REF" >/dev/null 2>&1
PUSH_OUT="$(docker push "$LOCAL_REF" 2>&1)"
MANIFEST_DIGEST="$(printf '%s\n' "$PUSH_OUT" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
if [[ -z "$MANIFEST_DIGEST" ]]; then
  echo "[test-preflight] Échec du push vers le registre local (digest introuvable) :" >&2
  printf '%s\n' "$PUSH_OUT" | tail -3 >&2
  exit 1
fi
DIGEST="${REGISTRY_HOST}/sentinel-backend@${MANIFEST_DIGEST}"

# Override qui déploie backend et frontend par digest (l'image de test sert aux
# deux : on ne teste ici que la validation de config, pas le contenu frontend).
OVERRIDE="$WORKDIR/registry.yml"
cat > "$OVERRIDE" <<YAML
services:
  backend:
    image: ${DIGEST}
  frontend:
    image: ${DIGEST}
YAML

# Écrit un .env de base valide, puis applique d'éventuelles substitutions.
write_env() {
  cat > "$PROJECT_ROOT/.env" <<EOF
DATABASE_URL=postgres://sentinel:${STRONG_DB}@postgres:5432/sentinel
POSTGRES_PASSWORD=${STRONG_DB}
COOKIE_SECRET=${COOKIE}
JWT_SECRET=${JWT}
CLIENT_ORIGIN=https://sentinel.akiksystems.fr
TRUST_PROXY=true
CADDY_DOMAIN=sentinel.akiksystems.fr
BUILD_SHA=${BUILD_SHA_OK}
SENTINEL_BACKEND_BIND_PORT=13000
SENTINEL_FRONTEND_BIND_PORT=18080
EOF
  printf "BOARD_ACCESS_CODE_HASH='%s'\n" "$BCRYPT_OK" >> "$PROJECT_ROOT/.env"
}

# Lance le préflight (BUILD_SHA retiré du shell : il ne doit venir que du .env).
run_preflight() {
  env -u BUILD_SHA -u DATABASE_URL -u POSTGRES_PASSWORD -u COOKIE_SECRET \
    -u JWT_SECRET -u BOARD_ACCESS_CODE_HASH -u CLIENT_ORIGIN -u TRUST_PROXY \
    bash scripts/preflight.sh \
    -f docker-compose.yml -f docker-compose.host-proxy.example.yml -f "$OVERRIDE" 2>&1
}

# --- Cas 1 : configuration valide, fournie uniquement par .env ---------------
write_env
OUT="$(run_preflight || true)"
if echo "$OUT" | grep -q "Déploiement autorisé"; then
  ok "config valide (via .env seul, BUILD_SHA absent du shell) acceptée"
else
  bad "config valide refusée à tort"
  echo "$OUT" | grep FAIL >&2 || true
fi

# Vérifie qu'aucun secret factice n'a fuité dans la sortie.
LEAK=0
for secret in "$STRONG_DB" "$COOKIE" "$JWT"; do
  if echo "$OUT" | grep -qF "$secret"; then LEAK=1; fi
done
if [[ "$LEAK" -eq 0 ]]; then
  ok "aucun secret ne figure dans la sortie du préflight"
else
  bad "un secret a fuité dans la sortie du préflight"
fi

# --- Cas invalides : chacun DOIT faire échouer le préflight ------------------
# Le refus se constate au CODE DE SORTIE non nul du préflight : cela couvre à la
# fois un refus après contrôles (« NE PAS déployer ») et un échec précoce de la
# composition Compose (ex. BUILD_SHA vide bloquant l'interpolation du build-arg).
expect_reject() {
  local label="$1"
  if run_preflight >/dev/null 2>&1; then
    bad "accepté à tort : $label"
  else
    ok "refusé : $label"
  fi
}

write_env
sed -i 's#^BUILD_SHA=.*#BUILD_SHA=#' "$PROJECT_ROOT/.env"
expect_reject "BUILD_SHA absent"

write_env
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://sentinel:weak@postgres:5432/sentinel#" "$PROJECT_ROOT/.env"
expect_reject "mot de passe DB faible"

write_env
sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${STRONG_DB}_different#" "$PROJECT_ROOT/.env"
expect_reject "POSTGRES_PASSWORD divergent de DATABASE_URL"

write_env
sed -i "s#^JWT_SECRET=.*#JWT_SECRET=${COOKIE}#" "$PROJECT_ROOT/.env"
expect_reject "COOKIE_SECRET identique à JWT_SECRET"

write_env
sed -i "s#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=http://sentinel.akiksystems.fr#" "$PROJECT_ROOT/.env"
expect_reject "CLIENT_ORIGIN en HTTP"

write_env
sed -i "s#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=https://localhost#" "$PROJECT_ROOT/.env"
expect_reject "CLIENT_ORIGIN local"

write_env
sed -i "s#^TRUST_PROXY=.*#TRUST_PROXY=false#" "$PROJECT_ROOT/.env"
expect_reject "TRUST_PROXY=false"

write_env
# bcrypt invalide : ancien SHA-256.
sed -i "s#^BOARD_ACCESS_CODE_HASH=.*#BOARD_ACCESS_CODE_HASH='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'#" "$PROJECT_ROOT/.env"
expect_reject "bcrypt invalide (SHA-256 hérité)"

# Digest incomplet : override avec un @sha256: tronqué.
write_env
BAD_OVERRIDE="$WORKDIR/bad-registry.yml"
cat > "$BAD_OVERRIDE" <<YAML
services:
  backend:
    image: ${DIGEST}
  frontend:
    image: ghcr.io/example/frontend@sha256:1234
YAML
if env -u BUILD_SHA bash scripts/preflight.sh \
    -f docker-compose.yml -f docker-compose.host-proxy.example.yml -f "$BAD_OVERRIDE" >/dev/null 2>&1; then
  bad "accepté à tort : digest d'image incomplet"
else
  ok "refusé : digest d'image incomplet"
fi

echo ""
echo "[test-preflight] $PASS test(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
