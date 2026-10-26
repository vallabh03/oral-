#!/usr/bin/env bash
# Deploys the latest code from the main branch: backup → pull → build → migrate → restart.
#   sudo ./update.sh
set -euo pipefail
STACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$STACK/../.." && pwd)"
ENV_FILE=/opt/taoc/.env
compose() { docker compose --env-file "$ENV_FILE" -f "$STACK/docker-compose.yml" "$@"; }

"$STACK/backup.sh"
# The checkout belongs to the login user who cloned it; pull as that user (deploy key in their ~/.ssh).
sudo -u "$(stat -c %U "$REPO_DIR")" git -C "$REPO_DIR" pull --ff-only
compose build app
# Migrations run (and must succeed) before the new app container starts.
compose up -d
docker image prune -f >/dev/null
compose ps
