#!/usr/bin/env bash
# Exercice automatisé de scripts/preflight.sh. Construit l'image backend (qui
# contient le checker de configuration de production), la pousse vers un registre
# local jetable pour obtenir un digest de manifeste RÉEL, et lance le préflight
# sur une matrice de fichiers .env : un cas valide et une série de cas invalides
# que le préflight DOIT refuser, chacun pour la CAUSE attendue.
#
# INVARIANT DE SÛRETÉ : ce test ne crée, ne modifie, ne renomme, ne sauvegarde
# ni ne supprime JAMAIS le .env à la racine du dépôt. Tout fichier d'environnement
# de test vit dans $WORKDIR et est passé explicitement au préflight via
# --env-file. Un .env sentinelle préexistant doit ressortir strictement identique
# (même contenu, même checksum) — c'est vérifié.
#
# Aucun secret réel : uniquement des valeurs factices, dont on prouve qu'elles ne
# fuient jamais sur stdout/stderr.

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
# Un second SHA valide (40 hex) mais DIFFÉRENT : sert à fabriquer une image
# "bonne forme, mauvaise release" pour le cas négatif digest ↔ BUILD_SHA.
BUILD_SHA_WRONG='0123456789abcdef0123456789abcdef01234567'

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
# Le fichier d'environnement de test vit UNIQUEMENT dans $WORKDIR. Le .env du
# dépôt n'est jamais touché.
TEST_ENV_FILE="$WORKDIR/test.env"

# Registre local jetable : le préflight, comme le déploiement réel, exige des
# images épinglées par digest @sha256:. Un digest de manifeste n'existe QUE pour
# une image poussée vers un registre. On ne peut PAS se reposer sur
# `.RepoDigests` d'une image seulement buildée (peuplé seulement par le magasin
# containerd, pas par le magasin classique des runners GitHub). On pousse donc
# vers un registre local éphémère sur un port loopback DYNAMIQUE (choisi par
# Docker) pour éviter toute collision de port fixe.
REGISTRY_NAME="preflight-registry-$$"
# Tags/images créés par ce test, à supprimer au cleanup.
CREATED_IMAGE_TAGS=(
  "sentinel-backend:preflight-test"
  "sentinel-backend:preflight-test-wrong"
)
REGISTRY_HOST=""

cleanup() {
  # Registre + son volume anonyme.
  docker rm -fv "$REGISTRY_NAME" >/dev/null 2>&1 || true
  # Tags/images poussés vers le registre local (référencés par host dynamique).
  if [[ -n "$REGISTRY_HOST" ]]; then
    docker rmi -f "${REGISTRY_HOST}/sentinel-backend:preflight-test" >/dev/null 2>&1 || true
    docker rmi -f "${REGISTRY_HOST}/sentinel-backend:preflight-test-wrong" >/dev/null 2>&1 || true
  fi
  # Tags locaux de construction.
  for t in "${CREATED_IMAGE_TAGS[@]}"; do
    docker rmi -f "$t" >/dev/null 2>&1 || true
  done
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

# --- Preuve P0 : un .env sentinelle préexistant reste intact ------------------
# On dépose un .env sentinelle à la racine SEULEMENT s'il n'y en a pas déjà un
# (on ne veut jamais écraser un vrai .env). On mémorise son checksum et on
# vérifie en fin de test qu'il n'a pas bougé. S'il en existe déjà un (poste de
# dev), on prend SON checksum comme sentinelle.
SENTINEL_ENV="$PROJECT_ROOT/.env"
SENTINEL_CREATED=0
SENTINEL_MARKER="# sentinelle test-preflight ne pas utiliser $$"
if [[ ! -e "$SENTINEL_ENV" ]]; then
  printf '%s\n' "$SENTINEL_MARKER" > "$SENTINEL_ENV"
  SENTINEL_CREATED=1
fi
SENTINEL_SUM_BEFORE="$(sha256sum "$SENTINEL_ENV" | awk '{print $1}')"
# Retire uniquement la sentinelle qu'on a nous-mêmes créée (jamais un vrai .env).
remove_sentinel_if_ours() {
  if [[ "$SENTINEL_CREATED" -eq 1 && -e "$SENTINEL_ENV" ]]; then
    if [[ "$(sha256sum "$SENTINEL_ENV" | awk '{print $1}')" == "$SENTINEL_SUM_BEFORE" ]]; then
      rm -f "$SENTINEL_ENV"
    fi
  fi
}

echo "[test-preflight] Construction de l'image backend (checker inclus)..."
docker build --build-arg BUILD_SHA="$BUILD_SHA_OK" \
  --tag sentinel-backend:preflight-test ./backend >/dev/null 2>&1
# Image "bonne forme, mauvaise release" : même Dockerfile, autre BUILD_SHA.
docker build --build-arg BUILD_SHA="$BUILD_SHA_WRONG" \
  --tag sentinel-backend:preflight-test-wrong ./backend >/dev/null 2>&1

echo "[test-preflight] Démarrage d'un registre local jetable (port loopback dynamique)..."
docker rm -fv "$REGISTRY_NAME" >/dev/null 2>&1 || true
# Port loopback DYNAMIQUE (jamais un port fixe qui pourrait entrer en collision) :
# on demande à l'OS un port libre via un socket éphémère, puis on le publie
# EXPLICITEMENT (127.0.0.1:PORT:5000). On évite `-p 127.0.0.1::5000` dont le port
# attribué peut être mal routé selon l'hôte (Docker Desktop/WSL2), ce qui casse
# le push HTTP. 127.0.0.0/8 est un registre non sécurisé par défaut → push HTTP.
REGISTRY_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
if [[ -z "$REGISTRY_PORT" ]]; then
  echo "[test-preflight] Impossible d'obtenir un port loopback libre." >&2
  exit 1
fi
REGISTRY_HOST="127.0.0.1:${REGISTRY_PORT}"
docker run -d --name "$REGISTRY_NAME" -p "${REGISTRY_HOST}:5000" registry:2 >/dev/null 2>&1
REGISTRY_READY=0
for _ in $(seq 1 15); do
  if curl -sf "http://${REGISTRY_HOST}/v2/" >/dev/null 2>&1; then REGISTRY_READY=1; break; fi
  sleep 1
done
if [[ "$REGISTRY_READY" -ne 1 ]]; then
  echo "[test-preflight] Le registre local n'a pas démarré — impossible de tester le déploiement par digest." >&2
  exit 1
fi

# Pousse une image vers le registre local et renvoie sa référence par digest de
# manifeste RÉEL (repo@sha256:...), utilisable en pull/run sur tout magasin.
push_and_digest() {
  local src_tag="$1" dest_tag="$2" ref push_out digest
  ref="${REGISTRY_HOST}/sentinel-backend:${dest_tag}"
  docker tag "$src_tag" "$ref" >/dev/null 2>&1
  push_out="$(docker push "$ref" 2>&1)"
  digest="$(printf '%s\n' "$push_out" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
  if [[ -z "$digest" ]]; then
    echo "[test-preflight] Échec du push vers le registre local ($dest_tag) :" >&2
    printf '%s\n' "$push_out" | tail -3 >&2
    exit 1
  fi
  printf '%s@%s' "${REGISTRY_HOST}/sentinel-backend" "$digest"
}

DIGEST_OK="$(push_and_digest sentinel-backend:preflight-test preflight-test)"
DIGEST_WRONG="$(push_and_digest sentinel-backend:preflight-test-wrong preflight-test-wrong)"

# S'assure que les images par digest sont présentes localement (procédure :
# pull non destructif AVANT préflight ; ici elles le sont déjà après le push).
docker image inspect "$DIGEST_OK" >/dev/null 2>&1 || docker pull "$DIGEST_OK" >/dev/null 2>&1
docker image inspect "$DIGEST_WRONG" >/dev/null 2>&1 || docker pull "$DIGEST_WRONG" >/dev/null 2>&1

# Override qui déploie backend et frontend par le digest VALIDE (image correcte).
OVERRIDE="$WORKDIR/registry.yml"
cat > "$OVERRIDE" <<YAML
services:
  backend:
    image: ${DIGEST_OK}
  frontend:
    image: ${DIGEST_OK}
YAML

# Écrit le fichier d'environnement de test dans $WORKDIR (JAMAIS le .env racine).
write_env() {
  cat > "$TEST_ENV_FILE" <<EOF
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
  printf "BOARD_ACCESS_CODE_HASH='%s'\n" "$BCRYPT_OK" >> "$TEST_ENV_FILE"
}

# Lance le préflight sur le fichier d'env de test isolé (--env-file), avec
# l'override par digest valide sauf indication contraire. BUILD_SHA est retiré du
# shell : il ne doit venir que du --env-file, comme sur le VPS après reconnexion.
run_preflight() {
  local override="${1:-$OVERRIDE}"
  env -u BUILD_SHA -u DATABASE_URL -u POSTGRES_PASSWORD -u COOKIE_SECRET \
    -u JWT_SECRET -u BOARD_ACCESS_CODE_HASH -u CLIENT_ORIGIN -u TRUST_PROXY \
    bash scripts/preflight.sh \
    --env-file "$TEST_ENV_FILE" \
    -f docker-compose.yml -f docker-compose.host-proxy.example.yml -f "$override" 2>&1
}

# --- Cas 1 : configuration valide (cas positif, dont digest ↔ BUILD_SHA) ------
write_env
OUT="$(run_preflight || true)"
if echo "$OUT" | grep -q "Déploiement autorisé"; then
  ok "config valide (via --env-file isolé, BUILD_SHA absent du shell) acceptée"
else
  bad "config valide refusée à tort"
  echo "$OUT" | grep FAIL >&2 || true
fi
# Le cas positif inclut la correspondance digest ↔ BUILD_SHA (label OCI + runtime).
if echo "$OUT" | grep -q "digests déployés cohérents avec le BUILD_SHA attendu"; then
  ok "correspondance digest ↔ BUILD_SHA confirmée sur le cas positif"
else
  bad "le contrôle digest ↔ BUILD_SHA n'a pas confirmé la cohérence sur le cas valide"
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

# --- Cas invalides : chacun DOIT être refusé POUR LA CAUSE ATTENDUE -----------
# Un simple code non nul ne suffit pas : un échec parasite ne doit pas valider un
# cas négatif. On exige (a) code de sortie non nul ET (b) un motif stable
# correspondant à la cause attendue dans la sortie du préflight. Aucun secret
# n'apparaît dans ces motifs (noms de variables / SHA / références d'images).
expect_reject() {
  local label="$1" pattern="$2" override="${3:-$OVERRIDE}"
  local out rc=0
  out="$(run_preflight "$override")" || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    bad "accepté à tort : $label"
    return
  fi
  if echo "$out" | grep -Eq "$pattern"; then
    ok "refusé (cause attendue) : $label"
  else
    bad "refusé mais pour une autre cause que « $label » (motif « $pattern » absent)"
    echo "$out" | grep -E "FAIL|Impossible" >&2 || true
  fi
}

# BUILD_SHA vide → la composition Compose échoue à l'interpolation du build-arg.
write_env
sed -i 's#^BUILD_SHA=.*#BUILD_SHA=#' "$TEST_ENV_FILE"
expect_reject "BUILD_SHA absent" "composition Compose est invalide|Impossible de continuer"

write_env
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://sentinel:weak@postgres:5432/sentinel#" "$TEST_ENV_FILE"
expect_reject "mot de passe DB faible" "garde de production|POSTGRES_PASSWORD"

write_env
sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${STRONG_DB}_different#" "$TEST_ENV_FILE"
expect_reject "POSTGRES_PASSWORD divergent de DATABASE_URL" "POSTGRES_PASSWORD diffère"

write_env
sed -i "s#^JWT_SECRET=.*#JWT_SECRET=${COOKIE}#" "$TEST_ENV_FILE"
expect_reject "COOKIE_SECRET identique à JWT_SECRET" "garde de production"

write_env
sed -i "s#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=http://sentinel.akiksystems.fr#" "$TEST_ENV_FILE"
expect_reject "CLIENT_ORIGIN en HTTP" "garde de production"

write_env
sed -i "s#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=https://localhost#" "$TEST_ENV_FILE"
expect_reject "CLIENT_ORIGIN local" "garde de production"

write_env
sed -i "s#^TRUST_PROXY=.*#TRUST_PROXY=false#" "$TEST_ENV_FILE"
expect_reject "TRUST_PROXY=false" "garde de production"

write_env
# bcrypt invalide : ancien SHA-256.
sed -i "s#^BOARD_ACCESS_CODE_HASH=.*#BOARD_ACCESS_CODE_HASH='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'#" "$TEST_ENV_FILE"
expect_reject "bcrypt invalide (SHA-256 hérité)" "garde de production"

# Digest incomplet : frontend avec un @sha256: tronqué.
write_env
BAD_OVERRIDE="$WORKDIR/bad-registry.yml"
cat > "$BAD_OVERRIDE" <<YAML
services:
  backend:
    image: ${DIGEST_OK}
  frontend:
    image: ghcr.io/example/frontend@sha256:1234
YAML
expect_reject "digest d'image incomplet" "n'est pas épinglée par un digest" "$BAD_OVERRIDE"

# --- Cas négatif P1 : digest valide mais image d'une AUTRE release -------------
# backend/frontend déployés par un digest COMPLET et VALIDE, mais l'image a été
# construite avec BUILD_SHA_WRONG. Le .env attend BUILD_SHA_OK. Le préflight doit
# refuser sur la NON-correspondance label OCI / SHA runtime.
write_env
WRONG_SHA_OVERRIDE="$WORKDIR/wrong-sha-registry.yml"
cat > "$WRONG_SHA_OVERRIDE" <<YAML
services:
  backend:
    image: ${DIGEST_WRONG}
  frontend:
    image: ${DIGEST_WRONG}
YAML
expect_reject "image d'une autre release (digest valide, mauvais BUILD_SHA)" \
  "label OCI de (backend|frontend).*!= BUILD_SHA attendu|BUILD_SHA runtime du backend.*!=" \
  "$WRONG_SHA_OVERRIDE"

# --- Preuve P0 : le .env sentinelle est resté strictement identique ----------
SENTINEL_SUM_AFTER="$(sha256sum "$SENTINEL_ENV" 2>/dev/null | awk '{print $1}' || echo "ABSENT")"
if [[ "$SENTINEL_SUM_AFTER" == "$SENTINEL_SUM_BEFORE" ]]; then
  ok "le .env sentinelle est intact (checksum inchangé : ${SENTINEL_SUM_BEFORE:0:12}…)"
else
  bad "le .env sentinelle a été modifié ou supprimé (avant ${SENTINEL_SUM_BEFORE:0:12}… / après ${SENTINEL_SUM_AFTER:0:12}…)"
fi
remove_sentinel_if_ours

# --- Preuve P0 : aucune ressource Docker de test ne subsiste ------------------
# On nettoie explicitement le registre (+ volume) et les tags, puis on prouve
# qu'il ne reste ni conteneur, ni tag, ni image du scénario.
docker rm -fv "$REGISTRY_NAME" >/dev/null 2>&1 || true
LEFT_CONTAINERS="$(docker ps -a --filter "name=${REGISTRY_NAME}" -q | wc -l | tr -d '[:space:]')"
LEFT_TAGS=0
for t in "${CREATED_IMAGE_TAGS[@]}" \
  "${REGISTRY_HOST}/sentinel-backend:preflight-test" \
  "${REGISTRY_HOST}/sentinel-backend:preflight-test-wrong"; do
  docker rmi -f "$t" >/dev/null 2>&1 || true
  if docker image inspect "$t" >/dev/null 2>&1; then LEFT_TAGS=$((LEFT_TAGS + 1)); fi
done
if [[ "$LEFT_CONTAINERS" -eq 0 && "$LEFT_TAGS" -eq 0 ]]; then
  ok "aucune ressource Docker de test ne subsiste (conteneur/registre/tags nettoyés)"
else
  bad "des ressources de test subsistent (conteneurs=$LEFT_CONTAINERS, tags=$LEFT_TAGS)"
fi

echo ""
echo "[test-preflight] $PASS test(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
