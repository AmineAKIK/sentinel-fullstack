#!/usr/bin/env bash
# Préflight de déploiement NON DESTRUCTIF : vérifie les prérequis d'une release
# AVANT tout arrêt ou remplacement de conteneur. Ne démarre aucun service, ne
# supprime rien. Il fait valider l'environnement par la MÊME garde que le
# démarrage réel (assertProductionConfig, via dist/scripts/checkProductionConfig
# exécuté dans l'image backend) — aucun contrôle dupliqué en bash, aucune
# divergence possible — puis ajoute les invariants d'infrastructure que cette
# garde ne peut pas voir (POSTGRES_PASSWORD == mot de passe de DATABASE_URL,
# BUILD_SHA des build-args, digests d'images, topologie réseau/ports).
#
# Aucune valeur de secret n'est jamais placée dans argv, un message ou un log :
# la configuration résolue (qui contient des secrets) ne circule que par stdin
# ou un fichier --env-file temporaire à permissions restreintes, détruit en fin
# d'exécution. Seuls des verdicts OK/FAIL sortent.
#
# Usage :
#   ./scripts/preflight.sh [-f docker-compose.yml -f docker-compose.override.yml ...]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

COMPOSE_ARGS=()
if [[ $# -gt 0 ]]; then
  COMPOSE_ARGS=("$@")
else
  COMPOSE_ARGS=(-f docker-compose.yml)
fi

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
if ! docker compose "${COMPOSE_ARGS[@]}" config --quiet 2>/dev/null; then
  bad "la composition Compose est invalide (docker compose config a échoué)"
  echo "[preflight] Impossible de continuer sans configuration valide." >&2
  exit 1
fi
ok "composition Compose valide"

# La configuration résolue est écrite dans un fichier à accès restreint, JAMAIS
# passée en argument de processus.
CONFIG_FILE="$WORKDIR/config.json"
docker compose "${COMPOSE_ARGS[@]}" config --format json > "$CONFIG_FILE"
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
if docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps \
    -e NODE_ENV=production \
    --entrypoint node backend dist/scripts/checkProductionConfig.js >/dev/null 2>"$WORKDIR/checker.err"; then
  ok "configuration acceptée par la garde de production (assertProductionConfig)"
else
  # Le message d'erreur de la garde ne contient que des noms de variables.
  reason="$(tail -n 1 "$WORKDIR/checker.err" 2>/dev/null || true)"
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

# 5. Images (variante registry) : épinglées par un digest @sha256: + 64 hex.
if json_check <<'PY'
import json, os, re, sys
d = json.load(open(os.environ["CONFIG_FILE"], encoding="utf-8"))
rx = re.compile(r"@sha256:[0-9a-f]{64}$")
problems = []
for svc in ("backend", "frontend"):
    image = str(d["services"].get(svc, {}).get("image", "") or "")
    # image absente = build local, accepté ; image présente = digest complet exigé.
    if image and not rx.search(image):
        problems.append(svc)
sys.exit(1 if problems else 0)
PY
then
  ok "images backend/frontend épinglées par digest complet (ou build local)"
else
  bad "une image backend/frontend n'est pas épinglée par un digest @sha256: + 64 hex"
fi

# 6. Topologie : publications sur le loopback uniquement, PostgreSQL jamais publié.
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
