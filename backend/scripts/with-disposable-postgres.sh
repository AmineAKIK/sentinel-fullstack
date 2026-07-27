#!/usr/bin/env bash
# Exécute une commande avec un PostgreSQL JETABLE et ISOLÉ, identique à celui du
# job CI « Backend / PostgreSQL integration » (postgres:15.18-alpine3.23). Sert à
# faire tourner localement le cycle « test rouge → correction → test vert » sur
# une vraie base, sans sudo et sans toucher au PostgreSQL système ni au .env du
# dépôt.
#
# Isolation :
#  - conteneur au nom unique (PID + aléatoire), volume ANONYME jetable ;
#  - port loopback DYNAMIQUE choisi côté hôte (jamais un port fixe) ;
#  - identifiants exclusivement de test ; base « sentinel_test » par défaut
#    (accepte le garde d'intégration qui exige un suffixe _test/_integration).
#    Surchargeable via DISPOSABLE_PG_DB pour la recette E2E, qui exige un nom se
#    terminant par _e2e (ex. DISPOSABLE_PG_DB=sentinel_e2e) ;
#  - nettoyage garanti par trap (conteneur + volume) sur toute sortie, puis
#    contrôle d'absence de résidu.
#
# DATABASE_URL est exporté UNIQUEMENT dans l'environnement de la commande passée ;
# le fichier .env du dépôt n'est ni lu ni modifié.
#
# Usage :
#   scripts/with-disposable-postgres.sh <commande...>
# Exemple :
#   scripts/with-disposable-postgres.sh npx jest --selectProjects integration

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <commande...>" >&2
  exit 2
fi

PG_IMAGE="postgres:15.18-alpine3.23"
RUN_ID="$$-${RANDOM}${RANDOM}"
PG_NAME="sentinel-testpg-${RUN_ID}"
PG_VOL=""
# Base par défaut « sentinel_test » ; surchargeable pour la recette E2E.
PG_DB="${DISPOSABLE_PG_DB:-sentinel_test}"

cleanup() {
  docker rm -fv "$PG_NAME" >/dev/null 2>&1 || true
  if [[ -n "$PG_VOL" ]]; then
    docker volume rm -f "$PG_VOL" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# Port loopback libre choisi côté hôte, publié explicitement.
PG_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
if [[ -z "$PG_PORT" ]]; then
  echo "[disposable-pg] impossible d'obtenir un port loopback libre" >&2
  exit 1
fi

echo "[disposable-pg] démarrage ${PG_IMAGE} sur 127.0.0.1:${PG_PORT} (conteneur ${PG_NAME})"
docker run -d --name "$PG_NAME" \
  -e POSTGRES_DB="$PG_DB" \
  -e POSTGRES_USER=sentinel \
  -e POSTGRES_PASSWORD=sentinel_test_password \
  -p "127.0.0.1:${PG_PORT}:5432" \
  "$PG_IMAGE" >/dev/null

PG_VOL="$(docker inspect --format '{{range .Mounts}}{{.Name}}{{end}}' "$PG_NAME" 2>/dev/null || true)"

# Attente de disponibilité (au plus ~30 s).
READY=0
for _ in $(seq 1 30); do
  if docker exec "$PG_NAME" pg_isready -U sentinel -d "$PG_DB" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [[ "$READY" -ne 1 ]]; then
  echo "[disposable-pg] PostgreSQL n'a pas démarré à temps" >&2
  exit 1
fi
echo "[disposable-pg] prêt."

# DATABASE_URL exporté pour la commande uniquement (sous-shell), NODE_ENV=test.
STATUS=0
(
  export DATABASE_URL="postgres://sentinel:sentinel_test_password@127.0.0.1:${PG_PORT}/${PG_DB}"
  export NODE_ENV=test
  export LOG_LEVEL="${LOG_LEVEL:-warn}"
  "$@"
) || STATUS=$?

# Nettoyage explicite + preuve d'absence de résidu (le trap repasserait dessus).
cleanup
trap - EXIT INT TERM
LEFT_C="$(docker ps -a --filter "name=^/${PG_NAME}$" -q | wc -l | tr -d '[:space:]')"
LEFT_V=0
if [[ -n "$PG_VOL" ]] && docker volume inspect "$PG_VOL" >/dev/null 2>&1; then LEFT_V=1; fi
if [[ "$LEFT_C" != "0" || "$LEFT_V" != "0" ]]; then
  echo "[disposable-pg] AVERTISSEMENT : résidu (conteneur=$LEFT_C, volume=$LEFT_V)" >&2
else
  echo "[disposable-pg] nettoyage complet : aucun conteneur ni volume résiduel."
fi

exit "$STATUS"
