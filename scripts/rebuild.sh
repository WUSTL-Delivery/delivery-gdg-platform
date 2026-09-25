#!/usr/bin/env bash
# Rebuild and (re)start the local stack from deployments/docker-compose.yml.
#
#   ./scripts/rebuild.sh              # up --build (foreground)
#   ./scripts/rebuild.sh -d           # detached
#   ./scripts/rebuild.sh --no-cache   # full rebuild
#   ./scripts/rebuild.sh --prod       # also apply docker-compose.prod.yml (Caddy)
#   ./scripts/rebuild.sh down|logs|ps|stop|restart [args]
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/deployments"

if [[ ! -f .env ]]; then
  echo "✗ deployments/.env missing. Copy deployments/.env.example to deployments/.env and fill it in." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "✗ 'docker compose' (v2) not available." >&2
  exit 1
fi

DC=(docker compose -f docker-compose.yml)
NO_CACHE=""
COMMAND="up"
EXTRA_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    --prod) DC+=(-f docker-compose.prod.yml) ;;
    down|logs|ps|stop|restart) COMMAND="$arg" ;;
    *) EXTRA_ARGS+=("$arg") ;;
  esac
done

case "$COMMAND" in
  up)
    [[ -n "$NO_CACHE" ]] && "${DC[@]}" build --no-cache
    exec "${DC[@]}" up --build ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
    ;;
  *)
    exec "${DC[@]}" "$COMMAND" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
    ;;
esac
