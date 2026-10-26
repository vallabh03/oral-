# Going live on AWS Lightsail (Mumbai): step by step

One server runs everything: the website, the PostgreSQL database and automatic HTTPS. About
**$24 a month** (₹2,500 + GST) for the 4 GB plan, plus about $4 for daily snapshots. Data stays in India.

```
Internet ──HTTPS──► Caddy (certificates) ──► App (Next.js) ──► PostgreSQL 17
                                                │                (private, not reachable from outside)
                                                └─► Photos on the server disk (backed up nightly)
```

You need: the AWS account **024303525196**, and access to the GitHub repo. A domain is optional to
start (a temporary address is used until you have one). Never paste passwords or keys into chat.

---

## 1. Create the server (AWS console, about 5 minutes)

1. Search **Lightsail** in the AWS console and open it.
2. **Create instance**:
   - Region: **Mumbai (ap-south-1)**, zone **ap-south-1a**
   - Platform **Linux/Unix** → **OS Only** → **Ubuntu 24.04 LTS**
   - Plan: **$24 — 4 GB RAM, 2 vCPUs, 80 GB SSD**
   - Name: `taoc-prod` → **Create instance**
3. Open the instance → **Networking** tab:
   - **Create static IP** → attach it to `taoc-prod` (free while attached). Note the IP.
   - Under IPv4 firewall, **Add rule** → **HTTPS (443)**. (SSH 22 and HTTP 80 are already there.)
4. **Snapshots** tab → turn on **Automatic snapshots** (daily). This keeps a copy of the whole
   server, including the database backups, inside AWS.

## 2. Connect and download the code (about 5 minutes)

1. On the instance page click **Connect using SSH**. A terminal opens in your browser.
2. Create a read-only key so the server can download the private repository:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/taoc_deploy -N "" -C "taoc-prod"
   ```
   ```bash
   cat ~/.ssh/taoc_deploy.pub
   ```
3. Copy the line it prints. In GitHub open the repo → **Settings → Deploy keys → Add deploy key** →
   title `taoc-prod`, paste the key, leave **Allow write access** unticked → **Add key**.
4. Back in the server terminal:
   ```bash
   git -c core.sshCommand="ssh -i ~/.ssh/taoc_deploy -o StrictHostKeyChecking=accept-new" clone git@github.com:vallabh03/oral-.git
   ```
   ```bash
   git -C ~/oral- config core.sshCommand "ssh -i ~/.ssh/taoc_deploy"
   ```

## 3. Install and start (about 10–15 minutes, mostly waiting)

```bash
sudo bash ~/oral-/deploy/lightsail/setup.sh
```

It asks two things:
- **Domain**: press **Enter** to use the temporary address it shows (like `13-233-10-20.sslip.io`),
  or type your domain if its DNS already points to the static IP (step 5).
- **Email**: for certificate notices.

It then installs Docker, turns on the firewall and automatic security updates, creates strong random
passwords in `/opt/taoc/.env` (private, readable only by root), builds the app, starts the database,
applies the database structure, creates a restricted database user for the app, and schedules a
nightly backup. When it finishes it prints the site address. Open it in your browser.

## 4. Create the staff accounts

```bash
sudo ~/oral-/deploy/lightsail/staff.sh vallabhneelkant01@gmail.com super_admin "Vallabh Neelkant"
```

Each command prints a one-time setup link (valid 24 hours). Send each link privately to that person
only. They set a password and connect an authenticator app on first sign-in. Roles: `super_admin`,
`admin` (doctor) or `assistant`. Repeat for each staff member.

## 5. Connect your domain (when you have one)

DNS can stay with your current provider (add the records there) or move to Lightsail (free):

1. **Records** — both pointing to the static IP:
   - `A` record `@` (the bare domain) → static IP
   - `A` record `www` → static IP
   With Lightsail DNS: Lightsail → **Domains & DNS → Create DNS zone** → "domain from another
   registrar" → add two **A records** (`@` and `www`) assigned to `taoc-prod`, then set the four
   Lightsail name servers at your registrar (e.g. GoDaddy → Domain → DNS → Nameservers → *I'll use
   my own*). With Cloudflare instead: set both records to **DNS only** (grey cloud) and remove any
   Worker routes for the domain.
2. Wait until the domain shows the static IP (`nslookup your-domain` or dnschecker.org).
3. On the server, change the address and rebuild:
   ```bash
   sudo nano /opt/taoc/.env
   ```
   Set `SITE_DOMAIN=your-domain`, `SITE_URL=https://your-domain` and
   `SITE_ADDRESSES="your-domain, www.your-domain"`, save (Ctrl+O, Enter, Ctrl+X), then:
   ```bash
   sudo ~/oral-/deploy/lightsail/update.sh
   ```
   Certificates are issued automatically; `www` redirects to the main address.

## Everyday operations

| Task | Command (in the server terminal) |
|---|---|
| Deploy the latest code from `main` (backs up first) | `sudo ~/oral-/deploy/lightsail/update.sh` |
| Backup now | `sudo ~/oral-/deploy/lightsail/backup.sh` |
| List backups | `sudo ls -lh /opt/taoc/backups` |
| Restore a backup (replaces current data) | `sudo ~/oral-/deploy/lightsail/restore.sh 20261027-0230` |
| See whether everything is running | `cd ~/oral-/deploy/lightsail && sudo docker compose --env-file /opt/taoc/.env ps` |
| See recent app logs | `cd ~/oral-/deploy/lightsail && sudo docker compose --env-file /opt/taoc/.env logs --tail 100 app` |
| Backup log | `sudo tail /var/log/taoc-backup.log` |

**Backups**: every night at 02:30 IST the database and photos are saved on the server and kept for
14 days (each dump is checked readable). Daily Lightsail snapshots copy the whole server, backups
included. For an extra copy outside the server, set `BACKUP_S3_BUCKET` and AWS keys in
`/opt/taoc/.env`. Try a restore on a copy once a month.

## Turning features on (after approvals)

Edit `/opt/taoc/.env`, then run `update.sh`:

| Setting | Turn on when |
|---|---|
| `INTAKE_ENABLED=true` | Programme approves live public registration |
| `INDEXING_ENABLED=true` | Clinical owner approves the public content (lets Google index the site) |
| `NOTIFY_DRIVER=whatsapp` + `WHATSAPP_*` | Meta verification and templates approved (see `DEPLOYMENT.md`) |
| `VIRTUAL_SCREENING_ENABLED=true`, `CLINICAL_IMAGES_ENABLED=true` | Clinical, privacy and security approvals; **first** move photos to a private S3 bucket (`STORAGE_DRIVER=s3`, separate clinical bucket + KMS key) — the app refuses to start otherwise |

## Security notes

- Only ports 22, 80 and 443 are open; the database is not reachable from the internet.
- The app connects as a restricted database user that cannot change the schema; the audit log and
  verified exams are protected by database rules.
- `/opt/taoc/.env` holds every secret. Never copy it into chat, email or git. **Never change
  `DATA_ENCRYPTION_KEY`** after the first start (it decrypts staff two-step-verification secrets).
- The operating system installs security updates automatically.
- Sign in to AWS with MFA, and remove the GitHub deploy key if the server is ever retired.

## Cost summary (Mumbai)

| Item | Per month |
|---|---|
| Lightsail 4 GB instance (includes 4 TB transfer) | $24 |
| Static IP (attached) | free |
| Automatic snapshots (~80 GB) | about $4 |
| **Total** | **about $28 + 18% GST ≈ ₹2,900** |

Later, when photo features are enabled: private S3 + KMS adds about $3–5 a month.
