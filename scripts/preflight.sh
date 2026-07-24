#!/usr/bin/env bash
# Préflight de déploiement NON DESTRUCTIF : vérifie les prérequis d'une release
# AVANT tout arrêt ou remplacement de conteneur. Ne démarre, n'arrête et ne
# supprime jamais rien. Les incompatibilités (secret placeholder, bcrypt
# invalide, digest manquant, port occupé) doivent être découvertes ici, pas au
# milieu du déploiement.
#
# Aucune valeur de secret n'est jamais affichée : seuls des verdicts OK/FAIL.
#
# Usage :
#   ./scripts/preflight.sh [-f docker-compose.yml -f docker-compose.override.yml ...]
# Sans -f, utilise la composition par défaut (docker-compose.yml). Les valeurs
# sont lues via `docker compose config` ; cette sortie ré-échappe les $ en $$,
# donc le préflight normalise ($$ -> $) pour valider la valeur telle que le
# conteneur la recevra réellement.

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

FAIL=0
ok() { echo "[preflight] OK: $1"; }
bad() { echo "[preflight] FAIL: $1" >&2; FAIL=1; }

# 1. La composition est valide (schéma + interpolation). Échoue tôt sinon.
if ! docker compose "${COMPOSE_ARGS[@]}" config --quiet 2>/dev/null; then
  bad "la composition Compose est invalide (docker compose config a échoué)"
  echo "[preflight] Impossible de continuer sans configuration valide." >&2
  exit 1
fi
ok "composition Compose valide"

CONFIG_JSON="$(docker compose "${COMPOSE_ARGS[@]}" config --format json)"

# Extrait une variable d'environnement résolue d'un service, sans l'afficher.
env_of() {
  local service="$1" key="$2"
  echo "$CONFIG_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['services']['$service']['environment'].get('$key',''))
"
}

# 2. Variables backend obligatoires présentes et non-placeholder. BUILD_SHA est
#    un build-arg (baké dans l'image), pas une variable runtime du service : on
#    le vérifie séparément sur l'environnement hôte passé à Compose.
PLACEHOLDER_RE='change_me|replace_with|votre_|your_'
for key in DATABASE_URL COOKIE_SECRET JWT_SECRET CLIENT_ORIGIN TRUST_PROXY BOARD_ACCESS_CODE_HASH; do
  value="$(env_of backend "$key")"
  if [[ -z "$value" ]]; then
    bad "variable backend manquante : $key"
  elif echo "$value" | grep -qiE "$PLACEHOLDER_RE"; then
    bad "variable backend encore à sa valeur placeholder : $key"
  else
    ok "variable backend présente : $key"
  fi
done

# 3. Secrets suffisamment longs (>= 24), sans révéler la valeur.
for key in COOKIE_SECRET JWT_SECRET; do
  value="$(env_of backend "$key")"
  if [[ "${#value}" -ge 24 ]]; then
    ok "$key a une longueur suffisante"
  else
    bad "$key est trop court (< 24 caractères)"
  fi
done

# 4. BUILD_SHA (build-arg, fourni via l'environnement hôte) est un SHA git de
#    40 caractères hexadécimaux.
build_sha="${BUILD_SHA:-}"
if [[ "$build_sha" =~ ^[a-f0-9]{40}$ ]]; then
  ok "BUILD_SHA est un SHA git complet"
else
  bad "BUILD_SHA n'est pas un SHA git de 40 caractères hexadécimaux"
fi

# 5. BOARD_ACCESS_CODE_HASH est un bcrypt valide TEL QUE le conteneur le recevra.
#    `docker compose config` ré-échappe systématiquement les $ en $$ dans sa
#    sortie (pour rester ré-injectable) ; ce n'est PAS ce que le conteneur reçoit.
#    On normalise donc $$ -> $ pour retrouver la valeur runtime et valider le
#    format. Le format canonique dans le .env est le hash entre quotes simples ;
#    un hash nu y serait tronqué par l'interpolation. La production exige bcrypt,
#    pas un ancien SHA-256.
board_hash_config="$(env_of backend BOARD_ACCESS_CODE_HASH)"
board_hash="${board_hash_config//\$\$/\$}"
if [[ "$board_hash" =~ ^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$ ]]; then
  ok "BOARD_ACCESS_CODE_HASH est un bcrypt valide"
else
  bad "BOARD_ACCESS_CODE_HASH n'est pas un bcrypt valide — un hash nu (sans quotes simples) est tronqué par l'interpolation, ou c'est un ancien hash SHA-256"
fi

# 6. Si des images sont référencées (variante registry), elles sont épinglées
#    par digest, pas par tag mutable.
for service in backend frontend; do
  image="$(echo "$CONFIG_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['services']['$service'].get('image',''))")"
  if [[ -z "$image" ]]; then
    ok "$service construit localement (aucune image de registry à vérifier)"
  elif [[ "$image" == *"@sha256:"* ]]; then
    ok "$service épinglé par digest"
  else
    bad "$service référence une image sans digest (tag mutable) : à épingler par @sha256:"
  fi
done

# 7. Les publications de ports (si présentes) restent sur le loopback, et
#    PostgreSQL n'est jamais publié.
if python3 - "$CONFIG_JSON" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
services = d['services']
pg_ports = services.get('postgres', {}).get('ports', [])
if pg_ports:
    sys.exit(1)
for svc in ('backend', 'frontend'):
    for p in services.get(svc, {}).get('ports', []):
        if p.get('host_ip') != '127.0.0.1':
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
