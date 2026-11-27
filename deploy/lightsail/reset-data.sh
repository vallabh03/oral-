#!/usr/bin/env bash
# Deletes ALL participant data (registrations, answers, results, messages, photos) before go-live.
# Staff accounts, camps and the audit log are kept. A backup is taken first.
#   sudo ./reset-data.sh
set -euo pipefail
STACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=/opt/taoc/.env
compose() { docker compose --env-file "$ENV_FILE" -f "$STACK/docker-compose.yml" "$@"; }

echo "This PERMANENTLY deletes every registration, questionnaire, result, message and photo."
echo "Staff logins and camps are kept. Participant IDs restart at 0001."
read -r -p "Type DELETE to continue: " answer
[[ "$answer" == "DELETE" ]] || { echo "Cancelled. Nothing was deleted."; exit 1; }

"$STACK/backup.sh"
# The migrate service connects as the database owner (needed to empty tables).
compose run --rm --no-deps migrate reset-patient-data --confirm DELETE-ALL-PATIENT-DATA
