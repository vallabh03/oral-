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

## 6. Move photos to S3 (before clinical or virtual-screening photos)

Photos start on the server disk. Before `CLINICAL_IMAGES_ENABLED` or `VIRTUAL_SCREENING_ENABLED`
can be turned on, photos must live in **private S3 buckets in Mumbai** — the app refuses to start
otherwise. Cost: about $3–5 a month. Takes about 20 minutes; staff can keep working meanwhile.

What gets created: two private buckets (identity photos; clinical images), each encrypted with its
own KMS key, a backups bucket, and one restricted AWS user `taoc-prod-app` that can reach only
those. Nothing in them is reachable from the internet; the app hands out 5-minute private links.

1. **Create the buckets** in the AWS console: click the **CloudShell** icon (terminal symbol in the
   top bar; make sure the region shows **Mumbai**). Paste the contents of
   `deploy/lightsail/s3-setup.sh` into a file and run it with your domain:
   ```bash
   cat > s3-setup.sh
   ```
   (paste the whole file, then press Ctrl+D)
   ```bash
   bash s3-setup.sh telanganaagainstoralcancer.com
   ```
   At the end it prints **8 settings lines**. Keep that window open for the next step; the
   secret key is shown only once. Never paste it into chat, email or git.

   **CloudShell says "account verification is in progress"?** New accounts can be blocked for up
   to two days. Either wait and retry, or run the same script on the server instead: in IAM create
   an access key for your administrator user (IAM → Users → your user → Security credentials →
   Create access key → "Command Line Interface"), then in the server terminal:
   ```bash
   sudo -i
   ```
   ```bash
   unset HISTFILE; export AWS_ACCESS_KEY_ID=paste-the-key-id AWS_SECRET_ACCESS_KEY=paste-the-secret
   ```
   ```bash
   bash ~ubuntu/oral-/deploy/lightsail/s3-setup.sh telanganaagainstoralcancer.com
   ```
   ```bash
   exit
   ```
   Then **delete that administrator access key** in IAM; the server keeps only the restricted
   `taoc-prod-app` key the script printed.
2. **Give the server the settings**: in the server terminal (Lightsail → Connect using SSH):
   ```bash
   sudo nano /opt/taoc/.env
   ```
   Paste the 8 lines, replacing the existing `AWS_REGION=` and `BACKUP_S3_BUCKET=` lines. Leave
   `STORAGE_DRIVER=local` for now. Save (Ctrl+O, Enter, Ctrl+X). Then type `clear` in CloudShell
   and close it.
3. **Copy the photos already on the server** into the buckets (nothing is deleted from the server):
   ```bash
   sudo ~/oral-/deploy/lightsail/s3-migrate.sh
   ```
4. **Switch the app to S3**: in `/opt/taoc/.env` change `STORAGE_DRIVER=local` to
   `STORAGE_DRIVER=s3`, save, then rebuild:
   ```bash
   sudo ~/oral-/deploy/lightsail/update.sh
   ```
5. **Catch photos saved during the switch** by running the copy once more (already-copied files are
   skipped):
   ```bash
   sudo ~/oral-/deploy/lightsail/s3-migrate.sh
   ```
6. **Check**: sign in and open a participant record that has a photo; it should display. Register a
   test participant with a photo and open it too. From now on photos are protected by bucket
   versioning (a deleted photo is recoverable for 30 days), and the nightly backup is also copied
   to the backups bucket (kept 90 days).

To go back to disk storage, set `STORAGE_DRIVER=local` and run `update.sh`; photos saved while on
S3 are not shown until you switch back. To issue a new access key later (for example after a staff
change), run the CloudShell script again with `ROTATE=1 bash s3-setup.sh <domain>`, update the two
`AWS_*` lines in `/opt/taoc/.env`, run `update.sh`, then delete the old key in IAM → Users →
`taoc-prod-app` → Security credentials.

## 7. Moving to a bigger plan (for example 2 GB → 4 GB)

Lightsail does not resize in place: snapshot, create a new instance from it, move the static IP.
About 20 minutes of downtime; everything on the disk (app, database, `/opt/taoc/.env`, deploy
key, backups, swap file) comes along.

1. On the server: `sudo ~/oral-/deploy/lightsail/backup.sh`, then stop the app so the snapshot is
   a clean copy: `cd ~/oral-/deploy/lightsail && sudo docker compose --env-file /opt/taoc/.env down`.
2. Instance → **Snapshots** → **Create snapshot** (manual). Wait until it is available.
3. Snapshot's menu → **Create new instance**: same region and zone, the bigger plan, a new name.
4. New instance → **Networking** → add the **HTTPS (443)** firewall rule (new instances only have
   22 and 80).
5. **Static IPs** → detach the IP from the old instance, attach it to the new one. DNS follows.
6. SSH into the new instance: `cd ~/oral-/deploy/lightsail && sudo docker compose --env-file
   /opt/taoc/.env up -d`, wait for `Up (healthy)`, check `free -h`.
7. Turn **automatic snapshots** on for the new instance. Keep the old one stopped for a day as a
   fallback (it is still billed), then delete it.

Fallback at any point: re-attach the IP to the old instance and run the `up -d` command there.

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
| `GALLERY_ENABLED=true` | Programme approves the photos in `src/content/gallery.ts` (adds the Gallery page and menu link) |
| `NOTIFY_DRIVER=whatsapp` + `WHATSAPP_*` | Meta verification and templates approved (see `DEPLOYMENT.md`) |
| `NOTIFY_DRIVER=leminai` + `LEMINAI_API_KEY` + `LEMINAI_BASE_URL=https://app.leminai.com` | Instead of the line above, when WhatsApp runs through the LeminAi provider. The templates `submission_received`, `review_no_lesion`, `review_suspicious`, `review_more_images` and `login_code` must be **approved in LeminAi with exactly these names and the same variables in the same order**. Delivery ticks are looked up from LeminAi every few minutes. Replies (including STOP) arrive in the LeminAi inbox, not on the website: if a patient asks to stop, withdraw their message consent on the website by hand |
| `CLINICAL_IMAGES_ENABLED=true` | Clinical, privacy and security approvals; **first** move photos to S3 (step 6) — the app refuses to start otherwise |
| `VIRTUAL_SCREENING_ENABLED=true` | Same approvals, **plus** WhatsApp (`NOTIFY_DRIVER=whatsapp` and the `WHATSAPP_*` settings, see `DEPLOYMENT.md`). Test one photo upload from a phone end to end before announcing it |
| `VIRTUAL_SCREENING_WITHOUT_MESSAGING=true` | Pilot **before** WhatsApp is approved: virtual screening runs with no messages at all. Participants are told results come by phone call, returning participants cannot log in with a code (they use their resume link or call the helpline), and the doctor's screen asks them to phone each result. Set `NOTIFY_CLINIC_PHONE` to the helpline number. Remove this line once WhatsApp is live |

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

Later, when photos move to S3 (step 6): two KMS keys ($2) plus storage and requests, about $3–5 a month in total.
