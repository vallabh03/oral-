#!/usr/bin/env bash
# Nightly backup: compressed database dump + photo files, kept 14 days on the server
# (and copied into every Lightsail snapshot). Optionally copied to S3 if BACKUP_S3_BUCKET is set.
set -euo pipefail
STACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=/opt/taoc/.env
DIR=/opt/taoc/backups
STAMP=$(date +%Y%m%d-%H%M)
set -a; . "$ENV_FILE"; set +a
compose() { docker compose --env-file "$ENV_FILE" -f "$STACK/docker-compose.yml" "$@"; }

umask 077
# Custom-format dump (restorable with pg_restore), written inside the db container's /backups mount.
compose exec -T db pg_dump -U taoc_owner -d taoc -Fc -f "/backups/db-$STAMP.dump"
# Photo files (local storage driver).
compose run --rm --no-deps --user 0 -v "$DIR:/backups" --entrypoint sh app -c "tar -czf /backups/objects-$STAMP.tgz -C /data objects" >/dev/null

# Verify the dump is readable before trusting it.
compose exec -T db pg_restore -l "/backups/db-$STAMP.dump" >/dev/null

find "$DIR" -type f \( -name 'db-*.dump' -o -name 'objects-*.tgz' \) -mtime +14 -delete

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  for f in "$DIR/db-$STAMP.dump" "$DIR/objects-$STAMP.tgz"; do
    docker run --rm -v "$DIR:/b:ro" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION="$AWS_REGION" \
      amazon/aws-cli:2.27.0 s3 cp "/b/$(basename "$f")" "s3://$BACKUP_S3_BUCKET/backups/$(basename "$f")" --sse aws:kms --only-show-errors
  done
fi
echo "$(date -Is) backup ok: db-$STAMP.dump objects-$STAMP.tgz"
