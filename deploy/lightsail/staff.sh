#!/usr/bin/env bash
# Creates a staff account and prints a one-time 24-hour setup link (send it privately).
#   sudo ./staff.sh name@example.org super_admin "Full Name"
#   roles: super_admin | admin (doctor) | assistant
set -euo pipefail
STACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=/opt/taoc/.env
[[ $# -ge 3 ]] || { echo 'Usage: staff.sh <email> <super_admin|admin|assistant> "Full Name"'; exit 64; }
docker compose --env-file "$ENV_FILE" -f "$STACK/docker-compose.yml" run --rm --no-deps \
  -e DATABASE_URL="postgres://taoc_app:$(grep ^DB_APP_PASSWORD= "$ENV_FILE" | cut -d= -f2)@db:5432/taoc?sslmode=disable" \
  migrate create-staff "$1" "$2" "$3"
