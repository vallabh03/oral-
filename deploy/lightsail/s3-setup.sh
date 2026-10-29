#!/usr/bin/env bash
# Creates the private S3 storage for photos: two buckets (identity photos, clinical images), their
# KMS keys, a backups bucket, and one restricted IAM user whose access key the Lightsail server uses.
#
# Run it ONCE in AWS CloudShell (AWS console → terminal icon at the top, region Mumbai), signed in
# as an administrator. CloudShell cannot see the GitHub repo, so paste the script in:
#   cat > s3-setup.sh        (paste the whole file, then Ctrl+D)
#   bash s3-setup.sh telanganaagainstoralcancer.com
#
# It prints the lines to add to /opt/taoc/.env on the server. Safe to re-run: existing keys,
# buckets and the user are kept and their settings re-applied. The access key is created only
# when the user has none; run with ROTATE=1 to issue a new one (then delete the old key in IAM).
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: bash s3-setup.sh <site-domain>   e.g. bash s3-setup.sh telanganaagainstoralcancer.com" >&2
  exit 1
fi
ENV_NAME="${ENV_NAME:-prod}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
export AWS_PAGER=""

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
P="taoc-$ENV_NAME"
PHOTOS="$P-photos-$ACCOUNT"
CLINICAL="$P-clinical-images-$ACCOUNT"
BACKUPS="$P-backups-$ACCOUNT"
APP_USER="$P-app"

say() { printf '\n== %s\n' "$*"; }

# ---------- KMS keys (one per bucket; rotation on) ----------
ensure_key() { # <alias-suffix> → key ARN
  local alias="alias/$P-$1" id
  id=$(aws kms list-aliases --query "Aliases[?AliasName=='$alias'].TargetKeyId" --output text)
  if [[ -z "$id" || "$id" == "None" ]]; then
    id=$(aws kms create-key --description "TAOC $ENV_NAME $1" --tags "TagKey=app,TagValue=taoc" "TagKey=env,TagValue=$ENV_NAME" --query KeyMetadata.KeyId --output text)
    aws kms create-alias --alias-name "$alias" --target-key-id "$id"
    aws kms enable-key-rotation --key-id "$id"
  fi
  aws kms describe-key --key-id "$id" --query KeyMetadata.Arn --output text
}

say "KMS keys"
PHOTOS_KEY=$(ensure_key photos)
CLINICAL_KEY=$(ensure_key clinical-images)
echo "photos key:   $PHOTOS_KEY"
echo "clinical key: $CLINICAL_KEY"

# ---------- Buckets ----------
ensure_bucket() { # <name> <kms-key-arn or empty for the free AWS-managed key>
  local b="$1" key="${2:-}" enc
  if ! aws s3api head-bucket --bucket "$b" 2>/dev/null; then
    aws s3api create-bucket --bucket "$b" --create-bucket-configuration "LocationConstraint=$AWS_DEFAULT_REGION" >/dev/null
  fi
  aws s3api put-bucket-tagging --bucket "$b" --tagging "TagSet=[{Key=app,Value=taoc},{Key=env,Value=$ENV_NAME}]"
  # Private by construction: no public ACLs or policies, owner-enforced ownership, TLS only.
  aws s3api put-public-access-block --bucket "$b" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-ownership-controls --bucket "$b" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
  aws s3api put-bucket-versioning --bucket "$b" --versioning-configuration Status=Enabled
  if [[ -n "$key" ]]; then
    enc="{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"$key\"}"
  else
    enc='{"SSEAlgorithm":"aws:kms"}'
  fi
  aws s3api put-bucket-encryption --bucket "$b" \
    --server-side-encryption-configuration "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":$enc,\"BucketKeyEnabled\":true}]}"
  aws s3api put-bucket-policy --bucket "$b" --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"RequireTLS\", \"Effect\": \"Deny\", \"Principal\": \"*\", \"Action\": \"s3:*\",
      \"Resource\": [\"arn:aws:s3:::$b\", \"arn:aws:s3:::$b/*\"],
      \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}
    }]
  }"
}

say "Buckets"
ensure_bucket "$PHOTOS" "$PHOTOS_KEY"
ensure_bucket "$CLINICAL" "$CLINICAL_KEY"
ensure_bucket "$BACKUPS" ""

# Housekeeping only (photo retention itself is pending the privacy owner, ADR-16):
# unfinished uploads are dropped after 7 days; a deleted photo stays recoverable as an old version
# for 30 days and is then gone for good.
PHOTO_LIFECYCLE='{"Rules":[
  {"ID":"abort-incomplete","Status":"Enabled","Filter":{},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}},
  {"ID":"deleted-recoverable-30d","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":30},"Expiration":{"ExpiredObjectDeleteMarker":true}}
]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$PHOTOS" --lifecycle-configuration "$PHOTO_LIFECYCLE"
# Clinical bucket: same, plus quarantine/ (unchecked browser uploads) is purged after 1 day — the
# app normally deletes those within seconds of validating them.
aws s3api put-bucket-lifecycle-configuration --bucket "$CLINICAL" --lifecycle-configuration '{"Rules":[
  {"ID":"abort-incomplete","Status":"Enabled","Filter":{},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}},
  {"ID":"deleted-recoverable-30d","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":30},"Expiration":{"ExpiredObjectDeleteMarker":true}},
  {"ID":"quarantine-1d","Status":"Enabled","Filter":{"Prefix":"quarantine/"},"Expiration":{"Days":1},"NoncurrentVersionExpiration":{"NoncurrentDays":1}}
]}'
# Backups: keep 90 days (the server itself keeps 14 days).
aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUPS" --lifecycle-configuration '{"Rules":[
  {"ID":"abort-incomplete","Status":"Enabled","Filter":{},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}},
  {"ID":"keep-90d","Status":"Enabled","Filter":{},"Expiration":{"Days":90},"NoncurrentVersionExpiration":{"NoncurrentDays":7}}
]}'

# Virtual screening: patients' browsers upload straight to the clinical bucket with short-lived
# presigned PUT links, so the bucket must answer CORS preflights from the site only.
aws s3api put-bucket-cors --bucket "$CLINICAL" --cors-configuration "{\"CORSRules\":[{
  \"AllowedOrigins\": [\"https://$DOMAIN\", \"https://www.$DOMAIN\"],
  \"AllowedMethods\": [\"PUT\"],
  \"AllowedHeaders\": [\"*\"],
  \"ExposeHeaders\": [\"ETag\"],
  \"MaxAgeSeconds\": 600
}]}"
echo "photos:   s3://$PHOTOS"
echo "clinical: s3://$CLINICAL  (CORS: PUT from https://$DOMAIN)"
echo "backups:  s3://$BACKUPS"

# ---------- The app's identity: one user, only these buckets and keys ----------
say "IAM user $APP_USER"
aws iam get-user --user-name "$APP_USER" >/dev/null 2>&1 || aws iam create-user --user-name "$APP_USER" --tags "Key=app,Value=taoc" "Key=env,Value=$ENV_NAME" >/dev/null
aws iam put-user-policy --user-name "$APP_USER" --policy-name taoc-storage --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Sid\": \"Objects\", \"Effect\": \"Allow\",
     \"Action\": [\"s3:PutObject\", \"s3:GetObject\", \"s3:DeleteObject\"],
     \"Resource\": [\"arn:aws:s3:::$PHOTOS/*\", \"arn:aws:s3:::$CLINICAL/*\"]},
    {\"Sid\": \"List\", \"Effect\": \"Allow\", \"Action\": [\"s3:ListBucket\"],
     \"Resource\": [\"arn:aws:s3:::$PHOTOS\", \"arn:aws:s3:::$CLINICAL\"]},
    {\"Sid\": \"BackupsWriteOnly\", \"Effect\": \"Allow\", \"Action\": [\"s3:PutObject\"],
     \"Resource\": [\"arn:aws:s3:::$BACKUPS/*\"]},
    {\"Sid\": \"Keys\", \"Effect\": \"Allow\",
     \"Action\": [\"kms:Encrypt\", \"kms:Decrypt\", \"kms:GenerateDataKey*\", \"kms:DescribeKey\"],
     \"Resource\": [\"$PHOTOS_KEY\", \"$CLINICAL_KEY\"]}
  ]
}"

KEYS=$(aws iam list-access-keys --user-name "$APP_USER" --query 'AccessKeyMetadata[].AccessKeyId' --output text)
if [[ -z "$KEYS" || "$KEYS" == "None" || "${ROTATE:-}" == "1" ]]; then
  CRED=$(aws iam create-access-key --user-name "$APP_USER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
  AK=$(cut -f1 <<<"$CRED"); SK=$(cut -f2 <<<"$CRED")
else
  AK="(existing key $KEYS — keep what is in /opt/taoc/.env, or run with ROTATE=1)"; SK="(unchanged)"
fi

say "Done. Add these lines to /opt/taoc/.env on the server (sudo nano /opt/taoc/.env), then follow docs/DEPLOY_LIGHTSAIL.md step 6."
cat <<EOF

AWS_REGION=$AWS_DEFAULT_REGION
AWS_ACCESS_KEY_ID=$AK
AWS_SECRET_ACCESS_KEY=$SK
S3_BUCKET=$PHOTOS
S3_KMS_KEY_ID=$PHOTOS_KEY
CLINICAL_S3_BUCKET=$CLINICAL
CLINICAL_S3_KMS_KEY_ID=$CLINICAL_KEY
BACKUP_S3_BUCKET=$BACKUPS

EOF
echo "The secret key is shown only this once. Do not paste it into chat, email or git. Close CloudShell when done (clear the screen first: clear)."
