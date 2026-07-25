#!/usr/bin/env bash
# Exercice automatisé de scripts/preflight.sh. Construit l'image backend (qui
# contient le checker de configuration de production), la pousse vers un registre
# local jetable pour obtenir un digest de manifeste RÉEL, et lance le préflight
# sur une matrice de fichiers d'environnement : un cas valide et une série de cas
# invalides que le préflight DOIT refuser, chacun pour la CAUSE attendue,
# constatée par un motif SPÉCIFIQUE à la variable en faute.
#
# INVARIANT DE SÛRETÉ (.env) : ce test ne crée, n'écrit, ne renomme, ne sauvegarde
# ni ne supprime JAMAIS le .env à la racine du dépôt. Il n'en dépose aucun. Il
# constate seulement son état initial (présent + checksum, ou absent) et vérifie
# — sur TOUTE sortie, via le trap — qu'il est inchangé : un .env présent ressort
# au checksum identique, un .env absent reste absent. Le fichier d'environnement
# de test vit uniquement dans $WORKDIR et est passé au préflight via --env-file.
#
# INVARIANT DE SÛRETÉ (Docker) : toutes les ressources portent un identifiant
# unique à l'exécution ($RUN_ID). Le nettoyage, garanti par trap sur toute sortie,
# ne supprime QUE les ressources créées par cette exécution (jamais de prune
# global), puis on prouve leur disparition (conteneur de registre, volume anonyme,
# tags locaux et registry, références par digest, images créées).
#
# Aucun secret réel : uniquement des valeurs factices, dont on prouve qu'elles ne
# fuient jamais sur stdout/stderr.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Identifiant unique de cette exécution : PID + composante aléatoire. Il préfixe
# le registre et tous les tags, pour ne jamais entrer en collision avec — ni
# écraser — une ressource préexistante d'un développeur.
RUN_ID="$$-${RANDOM}${RANDOM}"

# Secrets factices reconnaissables, pour prouver qu'ils ne fuient jamais.
STRONG_DB='FAKE_db_password_of_at_least_32_characters'
COOKIE='FAKE_cookie_secret_with_at_least_32_chars'
JWT='FAKE_jwt_secret_distinct_and_32_chars_long'
BCRYPT_OK="\$2b\$10\$nUd3TqHyISvb.aORRwqoQOXRMva5G3a2a7ks7SUCbh2DWhRTuGRRu"
BUILD_SHA_OK='c57b1f860f083a5318c8314ccf43f760a5624dce'
# Un second SHA valide (40 hex) mais DIFFÉRENT : sert à fabriquer une image
# "bonne forme, mauvaise release" pour le cas négatif digest ↔ BUILD_SHA.
BUILD_SHA_WRONG='0123456789abcdef0123456789abcdef01234567'
# Mot de passe DB faible (placeholder), pour le cas "mot de passe DB faible".
WEAK_DB='postgres'

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
TEST_ENV_FILE="$WORKDIR/test.env"

# --- Ressources Docker créées par cette exécution (pour un nettoyage exact) ----
REGISTRY_NAME="preflight-registry-${RUN_ID}"
REGISTRY_VOLUME=""            # volume anonyme du registre, renseigné après run
LOCAL_TAG_OK="sentinel-backend:preflight-${RUN_ID}-ok"
LOCAL_TAG_WRONG="sentinel-backend:preflight-${RUN_ID}-wrong"
# Références poussées vers le registre local (tags + digests), remplies au fur
# et à mesure ; le cleanup ne supprime QUE ces références.
CREATED_REFS=()

# --- Invariant .env : état initial constaté (jamais déposé) --------------------
SENTINEL_ENV="$PROJECT_ROOT/.env"
if [[ -e "$SENTINEL_ENV" ]]; then
  ENV_PRESENT_BEFORE=1
  ENV_SUM_BEFORE="$(sha256sum "$SENTINEL_ENV" | awk '{print $1}')"
else
  ENV_PRESENT_BEFORE=0
  ENV_SUM_BEFORE=""
fi

# Vérifie l'invariant .env. Renvoie 0 si respecté, 1 sinon. N'affiche jamais le
# contenu ni un secret — uniquement présence/absence et un préfixe de checksum.
ENV_INVARIANT_MSG=""
check_env_invariant() {
  if [[ "$ENV_PRESENT_BEFORE" -eq 1 ]]; then
    if [[ ! -e "$SENTINEL_ENV" ]]; then
      ENV_INVARIANT_MSG="le .env préexistant a été supprimé"
      return 1
    fi
    local now
    now="$(sha256sum "$SENTINEL_ENV" | awk '{print $1}')"
    if [[ "$now" != "$ENV_SUM_BEFORE" ]]; then
      ENV_INVARIANT_MSG="le .env préexistant a été modifié (avant ${ENV_SUM_BEFORE:0:12}… / après ${now:0:12}…)"
      return 1
    fi
    ENV_INVARIANT_MSG="le .env préexistant est inchangé (checksum ${ENV_SUM_BEFORE:0:12}…)"
    return 0
  else
    if [[ -e "$SENTINEL_ENV" ]]; then
      ENV_INVARIANT_MSG="un .env a été créé alors qu'il était absent au départ"
      return 1
    fi
    ENV_INVARIANT_MSG="le .env absent au départ reste absent"
    return 0
  fi
}

# --- Nettoyage idempotent, garanti par trap sur toute sortie ------------------
cleanup() {
  # Registre + son volume anonyme (rm -fv). Le volume est aussi retiré nommément
  # au cas où (idempotent).
  docker rm -fv "$REGISTRY_NAME" >/dev/null 2>&1 || true
  if [[ -n "$REGISTRY_VOLUME" ]]; then
    docker volume rm -f "$REGISTRY_VOLUME" >/dev/null 2>&1 || true
  fi
  # Références registry créées (tags + digests) et tags locaux.
  local ref
  for ref in "${CREATED_REFS[@]}" "$LOCAL_TAG_OK" "$LOCAL_TAG_WRONG"; do
    if [[ -n "$ref" ]]; then
      docker rmi -f "$ref" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$WORKDIR"
  # L'invariant .env doit tenir même sur sortie anticipée : on le contrôle ici,
  # et on l'échoue bruyamment (le test global échoue de toute façon si on sort
  # avant le compte final).
  if ! check_env_invariant; then
    echo "[test-preflight] FAIL (cleanup): $ENV_INVARIANT_MSG" >&2
  fi
}
trap cleanup EXIT INT TERM

echo "[test-preflight] Construction de l'image backend (checker inclus)..."
docker build --build-arg BUILD_SHA="$BUILD_SHA_OK" \
  --tag "$LOCAL_TAG_OK" ./backend >/dev/null 2>&1
# Image "bonne forme, mauvaise release" : même Dockerfile, autre BUILD_SHA.
docker build --build-arg BUILD_SHA="$BUILD_SHA_WRONG" \
  --tag "$LOCAL_TAG_WRONG" ./backend >/dev/null 2>&1

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
# Capture le volume anonyme du registre pour prouver sa disparition ensuite.
REGISTRY_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/registry"}}{{.Name}}{{end}}{{end}}' "$REGISTRY_NAME" 2>/dev/null || true)"
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
# manifeste RÉEL (repo@sha256:...), utilisable en pull/run sur tout magasin. Les
# références créées (tag registry + digest) sont enregistrées pour le nettoyage.
push_and_digest() {
  local src_tag="$1" dest_tag="$2" ref push_out digest digest_ref
  ref="${REGISTRY_HOST}/sentinel-backend:${dest_tag}"
  docker tag "$src_tag" "$ref" >/dev/null 2>&1
  CREATED_REFS+=("$ref")
  push_out="$(docker push "$ref" 2>&1)"
  digest="$(printf '%s\n' "$push_out" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
  if [[ -z "$digest" ]]; then
    echo "[test-preflight] Échec du push vers le registre local ($dest_tag) :" >&2
    printf '%s\n' "$push_out" | tail -3 >&2
    exit 1
  fi
  digest_ref="${REGISTRY_HOST}/sentinel-backend@${digest}"
  CREATED_REFS+=("$digest_ref")
  printf '%s' "$digest_ref"
}

DIGEST_OK="$(push_and_digest "$LOCAL_TAG_OK" "run-${RUN_ID}-ok")"
DIGEST_WRONG="$(push_and_digest "$LOCAL_TAG_WRONG" "run-${RUN_ID}-wrong")"

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
# On exige (a) code de sortie non nul ET (b) un motif SPÉCIFIQUE à la variable en
# faute (pas le motif générique « garde de production »), pour qu'un échec
# parasite ne puisse pas valider un cas négatif. Les motifs ne contiennent aucun
# secret (noms de variables, SHA, références d'images uniquement).
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

# Mot de passe DB faible : POSTGRES_PASSWORD ET le mot de passe de DATABASE_URL
# faibles ET identiques — sinon on ne déclencherait que leur divergence. La cause
# attendue est le rejet de la garde sur un mot de passe DB faible/placeholder.
write_env
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://sentinel:${WEAK_DB}@postgres:5432/sentinel#" "$TEST_ENV_FILE"
sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${WEAK_DB}#" "$TEST_ENV_FILE"
expect_reject "mot de passe DB faible (POSTGRES et DATABASE_URL)" "strong non-placeholder database password"

# Divergence POSTGRES_PASSWORD vs mot de passe de DATABASE_URL (les deux forts).
write_env
sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${STRONG_DB}_different#" "$TEST_ENV_FILE"
expect_reject "POSTGRES_PASSWORD divergent de DATABASE_URL" "POSTGRES_PASSWORD diffère"

write_env
sed -i "s#^JWT_SECRET=.*#JWT_SECRET=${COOKIE}#" "$TEST_ENV_FILE"
expect_reject "COOKIE_SECRET identique à JWT_SECRET" "COOKIE_SECRET and JWT_SECRET must be distinct"

write_env
sed -i "s#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=http://sentinel.akiksystems.fr#" "$TEST_ENV_FILE"
expect_reject "CLIENT_ORIGIN en HTTP" "CLIENT_ORIGIN must be an HTTPS origin"

write_env
sed -i "s#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=https://localhost#" "$TEST_ENV_FILE"
expect_reject "CLIENT_ORIGIN local" "local or placeholder hostname"

write_env
sed -i "s#^TRUST_PROXY=.*#TRUST_PROXY=false#" "$TEST_ENV_FILE"
expect_reject "TRUST_PROXY=false" "TRUST_PROXY must be true"

write_env
# bcrypt invalide : ancien SHA-256.
sed -i "s#^BOARD_ACCESS_CODE_HASH=.*#BOARD_ACCESS_CODE_HASH='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'#" "$TEST_ENV_FILE"
expect_reject "bcrypt invalide (SHA-256 hérité)" "must be a valid bcrypt digest"

# Digest de frontend tronqué (incomplet).
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

# Aucune image par digest (build local) : la release registry est EXIGÉE, donc
# refusée. On repart de la composition de base sans override registry.
write_env
run_preflight_no_registry() {
  env -u BUILD_SHA -u DATABASE_URL -u POSTGRES_PASSWORD -u COOKIE_SECRET \
    -u JWT_SECRET -u BOARD_ACCESS_CODE_HASH -u CLIENT_ORIGIN -u TRUST_PROXY \
    bash scripts/preflight.sh \
    --env-file "$TEST_ENV_FILE" \
    -f docker-compose.yml -f docker-compose.host-proxy.example.yml 2>&1
}
NO_DIGEST_OUT="$(run_preflight_no_registry || true)"
if printf '%s\n' "$NO_DIGEST_OUT" | grep -q "Déploiement autorisé"; then
  bad "accepté à tort : composition sans digest (build local)"
elif printf '%s\n' "$NO_DIGEST_OUT" | grep -Eq "n'est pas épinglée par un digest|release registry exigée"; then
  ok "refusé (cause attendue) : composition sans digest (build local)"
else
  bad "composition sans digest refusée pour une autre cause qu'attendue"
  printf '%s\n' "$NO_DIGEST_OUT" | grep -E "FAIL|Impossible" >&2 || true
fi

# --- Cas négatif P1 : digest valide mais image d'une AUTRE release -------------
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

# --- Preuve P0 : invariant .env respecté (présent inchangé / absent absent) ----
if check_env_invariant; then
  ok "invariant .env : $ENV_INVARIANT_MSG"
else
  bad "invariant .env violé : $ENV_INVARIANT_MSG"
fi

# --- Preuve P0 : nettoyage Docker complet, disparition contrôlée ---------------
# On nettoie explicitement (comme le fera aussi le trap), puis on prouve qu'aucun
# des objets créés par CETTE exécution ne subsiste : conteneur de registre,
# volume anonyme, tags locaux, tags/digests registry, images.
docker rm -fv "$REGISTRY_NAME" >/dev/null 2>&1 || true
if [[ -n "$REGISTRY_VOLUME" ]]; then
  docker volume rm -f "$REGISTRY_VOLUME" >/dev/null 2>&1 || true
fi
for ref in "${CREATED_REFS[@]}" "$LOCAL_TAG_OK" "$LOCAL_TAG_WRONG"; do
  docker rmi -f "$ref" >/dev/null 2>&1 || true
done

LEFT=0
# Conteneur de registre.
if [[ -n "$(docker ps -a --filter "name=^/${REGISTRY_NAME}$" -q)" ]]; then
  LEFT=$((LEFT + 1)); echo "[test-preflight]   subsiste: conteneur $REGISTRY_NAME" >&2
fi
# Volume anonyme du registre.
if [[ -n "$REGISTRY_VOLUME" ]] && docker volume inspect "$REGISTRY_VOLUME" >/dev/null 2>&1; then
  LEFT=$((LEFT + 1)); echo "[test-preflight]   subsiste: volume $REGISTRY_VOLUME" >&2
fi
# Tags/digests/images créés.
for ref in "${CREATED_REFS[@]}" "$LOCAL_TAG_OK" "$LOCAL_TAG_WRONG"; do
  if docker image inspect "$ref" >/dev/null 2>&1; then
    LEFT=$((LEFT + 1)); echo "[test-preflight]   subsiste: image/ref $ref" >&2
  fi
done
if [[ "$LEFT" -eq 0 ]]; then
  ok "nettoyage Docker complet : conteneur, volume, tags locaux et registry, digests, images — aucun ne subsiste"
else
  bad "$LEFT ressource(s) Docker de test subsiste(nt)"
fi

echo ""
echo "[test-preflight] $PASS test(s) réussi(s), $FAIL échec(s)."
[[ "$FAIL" -eq 0 ]]
