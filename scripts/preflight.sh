#!/usr/bin/env bash
# Préflight de déploiement. Il ne stoppe, ne remplace et ne reconfigure aucun
# service en cours, et ne modifie aucun fichier du dépôt (notamment jamais le
# .env). Il PEUT récupérer les images candidates et lance un conteneur backend
# éphémère, sans dépendances, afin d'exécuter la garde de configuration de
# production (assertProductionConfig, via dist/scripts/checkProductionConfig
# dans l'image backend) — aucun contrôle dupliqué en bash, aucune divergence
# possible — puis ajoute les invariants d'infrastructure que cette garde ne peut
# pas voir : POSTGRES_PASSWORD == mot de passe de DATABASE_URL, BUILD_SHA des
# build-args, images épinglées par digest, et surtout la CORRESPONDANCE entre le
# digest déployé et le BUILD_SHA attendu (label OCI + SHA runtime), enfin la
# topologie réseau/ports.
#
# Aucune valeur de secret n'est jamais placée dans argv, un message ou un log :
# la configuration résolue (qui contient des secrets) ne circule que par un
# fichier à permissions restreintes lu via une variable d'environnement, détruit
# en fin d'exécution. Seuls des verdicts OK/FAIL, le SHA et des références
# d'images (non secrets) sortent.
#
# Usage :
#   ./scripts/preflight.sh [--env-file <fichier>] \
#       [-f docker-compose.yml -f docker-compose.override.yml ...]
#
# --env-file est un flag GLOBAL de docker compose : quand il est fourni, Compose
# lit CE fichier au lieu du .env du répertoire, pour `config` comme pour `run`.
# Le .env du dépôt n'est alors ni lu, ni écrit, ni supprimé.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# --env-file optionnel (propagé en flag GLOBAL à toutes les commandes compose) ;
# le reste des arguments est une liste de -f pour la composition.
ENV_FILE_ARGS=()
COMPOSE_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || { echo "[preflight] --env-file exige un chemin" >&2; exit 2; }
      ENV_FILE_ARGS=(--env-file "$2")
      shift 2
      ;;
    *)
      COMPOSE_ARGS+=("$1")
      shift
      ;;
  esac
done
if [[ ${#COMPOSE_ARGS[@]} -eq 0 ]]; then
  COMPOSE_ARGS=(-f docker-compose.yml)
fi

# Wrapper : docker compose avec le --env-file global éventuel EN PREMIER.
dc() { docker compose "${ENV_FILE_ARGS[@]}" "${COMPOSE_ARGS[@]}" "$@"; }

umask 077
WORKDIR="$(mktemp -d)"
# shellcheck disable=SC2317 # appelée par le trap
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT INT TERM

FAIL=0
ok() { echo "[preflight] OK: $1"; }
bad() {
  echo "[preflight] FAIL: $1" >&2
  FAIL=1
}

# 1. Composition valide (schéma + interpolation).
if ! dc config --quiet 2>/dev/null; then
  bad "la composition Compose est invalide (docker compose config a échoué)"
  echo "[preflight] Impossible de continuer sans configuration valide." >&2
  exit 1
fi
ok "composition Compose valide"

# La configuration résolue est écrite dans un fichier à accès restreint, JAMAIS
# passée en argument de processus.
CONFIG_FILE="$WORKDIR/config.json"
dc config --format json > "$CONFIG_FILE"
export CONFIG_FILE

# Exécute un contrôle python (code lu sur stdin) : le JSON est chargé depuis le
# fichier via $CONFIG_FILE (variable d'env, pas argv), jamais un secret en
# argument. Retourne le code de sortie du python.
json_check() {
  CONFIG_FILE="$CONFIG_FILE" python3
}

# 2. Validation de configuration par la garde de production réelle, dans l'image
#    backend. `docker compose run backend` hérite de l'environnement résolu du
#    service (déjà dé-échappé, tel que le conteneur le reçoit) ; on force
#    NODE_ENV=production et on exécute le checker compilé, sans démarrer le
#    serveur ni ouvrir de connexion. Aucun secret ne transite par argv.
if dc run --rm --no-deps \
    -e NODE_ENV=production \
    --entrypoint node backend dist/scripts/checkProductionConfig.js >/dev/null 2>"$WORKDIR/checker.err"; then
  ok "configuration acceptée par la garde de production (assertProductionConfig)"
else
  # Le checker émet « production config INVALID: <message> » sur stderr, mais
  # `docker compose run` y intercale ses propres lignes de progression (Creating…)
  # et parfois une ligne vide finale. On extrait donc précisément la ligne du
  # verdict de la garde (qui ne contient que des noms de variables, aucun secret),
  # sans se fier à la dernière ligne.
  reason="$(grep -m1 'production config INVALID:' "$WORKDIR/checker.err" 2>/dev/null \
    | sed 's/.*production config INVALID: //' || true)"
  bad "configuration refusée par la garde de production : ${reason:-voir le démarrage backend}"
fi

# 3. POSTGRES_PASSWORD doit être identique au mot de passe décodé de DATABASE_URL
#    (la garde backend ne voit pas POSTGRES_PASSWORD, c'est un invariant infra).
if json_check <<'PY'
import json, os, sys, urllib.parse
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
# POSTGRES_PASSWORD est défini sur le service postgres ; DATABASE_URL sur backend.
pg = str(d["services"].get("postgres", {}).get("environment", {}).get("POSTGRES_PASSWORD", "") or "").replace("$$", "$")
url = str(d["services"].get("backend", {}).get("environment", {}).get("DATABASE_URL", "") or "").replace("$$", "$")
try:
    dbpw = urllib.parse.unquote(urllib.parse.urlparse(url).password or "")
except Exception:
    sys.exit(1)
sys.exit(0 if (pg and dbpw and pg == dbpw) else 1)
PY
then
  ok "POSTGRES_PASSWORD correspond au mot de passe de DATABASE_URL"
else
  bad "POSTGRES_PASSWORD diffère du mot de passe de DATABASE_URL (ou absent)"
fi

# 4. BUILD_SHA : lu depuis les build-args résolus (pas l'environnement du shell,
#    absent après une reconnexion SSH). Les deux services doivent porter le même
#    SHA de 40 hex.
if json_check <<'PY'
import json, os, re, sys
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
def sha(svc):
    return str(d["services"].get(svc, {}).get("build", {}).get("args", {}).get("BUILD_SHA", "") or "")
b, f = sha("backend"), sha("frontend")
rx = re.compile(r"^[a-f0-9]{40}$")
sys.exit(0 if (b and b == f and rx.match(b)) else 1)
PY
then
  ok "BUILD_SHA (build-args) identique et complet sur backend et frontend"
else
  bad "BUILD_SHA absent, divergent ou non conforme (40 hex) dans les build-args"
fi

# 5. Images épinglées par un digest @sha256: + 64 hex, EXIGÉ pour backend ET
#    frontend. Ce préflight certifie une release de REGISTRY : une composition
#    sans digest (build local) est refusée. Le développement local peut utiliser
#    Compose sans passer par ce préflight, mais ne prétend alors pas satisfaire
#    le contrat de release.
if json_check <<'PY'
import json, os, re, sys
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
rx = re.compile(r"@sha256:[0-9a-f]{64}$")
missing = []
for svc in ("backend", "frontend"):
    image = str(d["services"].get(svc, {}).get("image", "") or "")
    if not rx.search(image):
        missing.append(svc)
sys.exit(1 if missing else 0)
PY
then
  ok "images backend et frontend épinglées par digest complet (@sha256: + 64 hex)"
else
  bad "une image backend/frontend n'est pas épinglée par un digest @sha256: + 64 hex (release registry exigée)"
fi

# 6. CORRESPONDANCE digest ↔ BUILD_SHA attendu. Le contrôle #4 vérifie que le
#    build-arg BUILD_SHA est bien formé et #5 que les images sont épinglées par
#    digest — mais rien ne garantit que ces digests désignent des images
#    RÉELLEMENT construites pour ce SHA. Une release antérieure a un digest valide
#    et un SHA valide : sans ce contrôle, on déploierait de mauvaises images sans
#    le voir avant le health post-remplacement. On exige donc, pour backend et
#    frontend, que le label OCI org.opencontainers.image.revision de l'image
#    déployée soit égal au BUILD_SHA attendu, et pour le backend que le BUILD_SHA
#    embarqué au runtime le soit aussi. Le SHA et les références d'images ne sont
#    pas des secrets : ils peuvent apparaître.
#
# Extrait (sans secret) le SHA attendu et les images par digest depuis la config.
EXPECTED_SHA="$(json_check <<'PY'
import json, os
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
print(str(d["services"].get("backend", {}).get("build", {}).get("args", {}).get("BUILD_SHA", "") or ""))
PY
)"
# Images déployées par digest, une par ligne : "service<TAB>reference".
DIGEST_IMAGES="$(json_check <<'PY'
import json, os
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
for svc in ("backend", "frontend"):
    image = str(d["services"].get(svc, {}).get("image", "") or "")
    if "@sha256:" in image:
        print(f"{svc}\t{image}")
PY
)"

sha_ok() { [[ "$1" =~ ^[a-f0-9]{40}$ ]]; }

if ! sha_ok "$EXPECTED_SHA"; then
  # Sans SHA attendu bien formé (déjà signalé par #4), on ne peut pas comparer.
  bad "impossible de vérifier la correspondance digest ↔ BUILD_SHA (SHA attendu absent ou mal formé)"
elif [[ -z "$DIGEST_IMAGES" ]]; then
  # Sans image par digest (déjà refusé par #5), rien à confronter : échec.
  bad "aucune image par digest à confronter au BUILD_SHA (release registry exigée)"
else
  MISMATCH=0
  while IFS=$'\t' read -r svc ref; do
    [[ -n "$svc" ]] || continue
    # L'image doit être présente localement (procédure : pull non destructif
    # AVANT préflight). Absente = on ne peut pas confronter, c'est un échec.
    if ! docker image inspect "$ref" >/dev/null 2>&1; then
      bad "image $svc absente en local ($ref) — exécuter le pull non destructif avant le préflight"
      MISMATCH=1
      continue
    fi
    label="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$ref" 2>/dev/null || true)"
    if [[ "$label" != "$EXPECTED_SHA" ]]; then
      bad "label OCI de $svc (${label:-absent}) != BUILD_SHA attendu ($EXPECTED_SHA)"
      MISMATCH=1
    fi
    if [[ "$svc" == "backend" ]]; then
      runtime_sha="$(docker run --rm --entrypoint printenv "$ref" BUILD_SHA 2>/dev/null || true)"
      if [[ "$runtime_sha" != "$EXPECTED_SHA" ]]; then
        bad "BUILD_SHA runtime du backend (${runtime_sha:-absent}) != BUILD_SHA attendu ($EXPECTED_SHA)"
        MISMATCH=1
      fi
    fi
  done <<< "$DIGEST_IMAGES"
  if [[ "$MISMATCH" -eq 0 ]]; then
    ok "digests déployés cohérents avec le BUILD_SHA attendu (label OCI + SHA runtime)"
  fi
fi

# 7. Topologie : publications sur le loopback uniquement, PostgreSQL jamais publié.
if json_check <<'PY'
import json, os, sys
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
services = d["services"]
if services.get("postgres", {}).get("ports", []):
    sys.exit(1)
for svc in ("backend", "frontend"):
    for p in services.get(svc, {}).get("ports", []):
        if p.get("host_ip") != "127.0.0.1":
            sys.exit(1)
sys.exit(0)
PY
then
  ok "publications de ports conformes (loopback, postgres non exposé)"
else
  bad "une publication de port viole les invariants (hors loopback ou postgres exposé)"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "[preflight] Tous les contrôles passent. Déploiement autorisé."
else
  echo "[preflight] Des contrôles ont échoué. NE PAS déployer avant correction." >&2
fi
exit "$FAIL"
