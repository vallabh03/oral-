#!/usr/bin/env bash
# Restores a backup taken by backup.sh. DESTRUCTIVE: replaces the current database and photos.
#   sudo ./restore.sh 20261027-0230
set -euo pipefail
STACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=/opt/taoc/.env
DIR=/opt/taoc/backups
STAMP=${1:?Usage: restore.sh <stamp>, e.g. 20261027-0230 (see ls /opt/taoc/backups)}
[[ -f "$DIR/db-$STAMP.dump" ]] || { echo "No $DIR/db-$STAMP.dump"; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$STACK/docker-compose.yml" "$@"; }

read -r -p "This replaces ALL current data with the backup from $STAMP. Type RESTORE to continue: " ok
[[ $ok == RESTORE ]] || { echo "Cancelled."; exit 1; }

compose stop app caddy
compose exec -T db pg_restore -U taoc_owner -d taoc --clean --if-exists --no-owner "/backups/db-$STAMP.dump"
if [[ -f "$DIR/objects-$STAMP.tgz" ]]; then
  compose run --rm --no-deps --user 0 -v "$DIR:/backups:ro" --entrypoint sh app -c "rm -rf /data/objects/* && tar -xzf /backups/objects-$STAMP.tgz -C /data && chown -R node:node /data/objects"
fi
# Re-apply migrations and the app role's grants, then start everything again.
compose run --rm migrate
compose up -d
echo "Restored $STAMP. Check the audit chain in the Super Admin overview."
