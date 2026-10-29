#!/usr/bin/env bash
# Copies the photos stored on this server's disk into the S3 buckets (one-time move to S3).
# Run after s3-setup.sh printed the S3_*/CLINICAL_S3_*/AWS_* lines and they are in /opt/taoc/.env:
#   sudo ./s3-migrate.sh
# Nothing is deleted from the server; files already in S3 are skipped, so it is safe to run twice
# (once before switching STORAGE_DRIVER to s3, once right after, to catch photos saved meanwhile).
set -euo pipefail
ENV_FILE=/opt/taoc/.env
set -a; . "$ENV_FILE"; set +a
: "${S3_BUCKET:?S3_BUCKET is missing in $ENV_FILE (run s3-setup.sh in CloudShell first)}"
: "${CLINICAL_S3_BUCKET:?CLINICAL_S3_BUCKET is missing in $ENV_FILE}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is missing in $ENV_FILE}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is missing in $ENV_FILE}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

# The photo files live in the compose volume named "objects".
VOL=$(docker volume ls -q --filter label=com.docker.compose.volume=objects | head -1)
[[ -n "$VOL" ]] || { echo "photo volume not found (is the stack installed?)" >&2; exit 1; }

cli() {
  docker run --rm -v "$VOL:/objects:ro" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION="$AWS_REGION" \
    --entrypoint "$1" amazon/aws-cli:2.27.0 "${@:2}"
}

copy() { # <folder> <bucket> <kms key id or empty>
  local folder="$1" bucket="$2" key="${3:-}" sse=()
  if ! cli sh -c "test -d /objects/$folder"; then
    echo "$folder/: nothing on disk"
    return
  fi
  if [[ -n "$key" ]]; then sse=(--sse aws:kms --sse-kms-key-id "$key"); fi
  echo "$folder/ → s3://$bucket/$folder/"
  cli aws s3 sync "/objects/$folder" "s3://$bucket/$folder" --size-only --only-show-errors "${sse[@]}"
}

# Identity photos go to the photo bucket; lesion and patient-captured images to the clinical one.
# quarantine/ holds unchecked temporary uploads and is not copied.
copy photos "$S3_BUCKET" "${S3_KMS_KEY_ID:-}"
copy lesions "$CLINICAL_S3_BUCKET" "${CLINICAL_S3_KMS_KEY_ID:-}"
copy remote "$CLINICAL_S3_BUCKET" "${CLINICAL_S3_KMS_KEY_ID:-}"

echo "$(date -Is) copy ok. Files on disk were left in place."
echo "Next: set STORAGE_DRIVER=s3 in $ENV_FILE and run update.sh, then run this script once more."
