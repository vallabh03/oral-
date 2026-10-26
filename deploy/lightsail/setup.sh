#!/usr/bin/env bash
# First-time setup of a fresh Ubuntu 24.04 Lightsail server (run once, as root):
#   sudo bash ~/oral-/deploy/lightsail/setup.sh
# Installs Docker, adds swap, enables the firewall, generates secrets into /opt/taoc/.env,
# builds the app, starts everything and schedules nightly backups. Safe to re-run: existing
# secrets are kept (the database password must never change after the first start).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="$REPO_DIR/deploy/lightsail"
ENV_FILE=/opt/taoc/.env

if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

say "Installing Docker"
if ! command -v docker >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

say "Adding 2 GB swap (the app build needs extra memory)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

say "Firewall: allow SSH, HTTP, HTTPS only"
apt-get install -y -qq ufw unattended-upgrades >/dev/null
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443 >/dev/null
ufw --force enable >/dev/null
# Automatic security updates for the operating system.
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null

mkdir -p /opt/taoc/backups
chmod 700 /opt/taoc /opt/taoc/backups

if [[ ! -f $ENV_FILE ]]; then
  say "Site address"
  PUBLIC_IP=$(curl -fsS https://checkip.amazonaws.com || true)
  echo "Enter the domain for the site (for example screening.example.org)."
  echo "Leave empty to use a temporary address based on this server's IP: ${PUBLIC_IP//./-}.sslip.io"
  read -r -p "Domain: " DOMAIN
  DOMAIN=${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}
  ALERT_EMAIL=""
  while [[ ! $ALERT_EMAIL =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
    read -r -p "Email for certificate and backup alerts: " ALERT_EMAIL
  done
  rnd() { openssl rand -hex 32; }
  umask 077
  cat > "$ENV_FILE" <<EOF
# TAOC production settings. Keep private: contains secrets. Never commit or share.
# Quote any value that contains spaces (the scripts read this file with bash).
SITE_DOMAIN=$DOMAIN
# Names the server answers to; add www.<domain> (comma-separated) once its DNS points here.
SITE_ADDRESSES=$DOMAIN
SITE_URL=https://$DOMAIN
ALERT_EMAIL=$ALERT_EMAIL
DB_OWNER_PASSWORD=$(rnd)
DB_APP_PASSWORD=$(rnd)
AUDIT_HMAC_SECRET=$(rnd)
DATA_ENCRYPTION_KEY=$(rnd)
# Must never change after first start: it decrypts stored two-step-verification secrets.

# Feature switches (turn on only after the programme approvals)
INTAKE_ENABLED=false
INDEXING_ENABLED=false
CLINICAL_IMAGES_ENABLED=false
VIRTUAL_SCREENING_ENABLED=false
NOTIFY_DRIVER=console
NOTIFY_CLINIC_NAME="Telangana Against Oral Cancer"
NOTIFY_CLINIC_PHONE=

# Photo storage: local disk on this server. Switch to s3 (with the S3_* and AWS_* settings)
# before enabling clinical or virtual-screening photos.
STORAGE_DRIVER=local
AWS_REGION=ap-south-1
# Optional off-server backup copy (S3 bucket name; needs AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)
BACKUP_S3_BUCKET=
EOF
  echo "Secrets written to $ENV_FILE"
else
  say "Keeping existing settings in $ENV_FILE"
fi

say "Building and starting (first build takes about 5-10 minutes)"
cd "$STACK"
docker compose --env-file "$ENV_FILE" build app
docker compose --env-file "$ENV_FILE" up -d

say "Scheduling nightly backups (02:30 IST) and keeping 14 days"
cat > /etc/cron.d/taoc-backup <<EOF
SHELL=/bin/bash
CRON_TZ=Asia/Kolkata
30 2 * * * root $STACK/backup.sh >> /var/log/taoc-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/taoc-backup

set -a; . "$ENV_FILE"; set +a
say "Done"
echo "Site: $SITE_URL  (the HTTPS certificate can take a minute on first visit)"
echo "Next: create the first Super Admin:"
echo "  sudo $STACK/staff.sh you@example.org super_admin \"Your Name\""
