# Deployment runbook (AWS)

Nothing has been deployed yet. Production go-live still needs the approvals in PRD §12.4 and
`docs/DECISIONS.md` (ADR-18 records the hosting design).

## What gets deployed

```
GitHub (main) ──CI──► Deploy workflow ──OIDC──► AWS account, ap-south-2 (Hyderabad)
                                                 │
 Browser ─HTTPS─► AWS WAF ─► Application Load Balancer ─► ECS Fargate tasks (Docker image)
                                                 │            ├─ init container: migrate (schema owner)
                                                 │            └─ app container: Next.js (DML-only DB role)
                                                 ├─► RDS PostgreSQL 17 (isolated subnets, KMS, backups, TLS forced)
                                                 ├─► S3: photos bucket + separate clinical-images bucket (private, KMS)
                                                 └─► Secrets Manager (DB passwords, audit HMAC key, data key)
```

All of it is code in `infra/` (AWS CDK, TypeScript). One CloudFormation stack per environment:

| Stack | What | Deployed by |
|---|---|---|
| `Taoc-<env>-Ci` | GitHub OIDC trust + deploy role (no stored AWS keys) | an administrator, once |
| `Taoc-<env>` | network, database, buckets, keys, secrets, containers, load balancer, WAF, alarms | GitHub Actions |

Per-environment, non-secret settings live in `infra/config/<env>.json` (reviewed in pull requests).
Secrets are generated inside AWS by the stack and never appear in git, CI logs or the image.

## Pipelines (`.github/workflows/`)

- **ci.yml**: on every pull request and push to `main`: dependency audit, secret scan, typecheck,
  unit/integration/security tests, build, Playwright, SEO gate; **container** job builds the
  production image and runs it in production mode against a real PostgreSQL (migrate → app role
  → health check → proves the app role cannot change the schema); **infra** job typechecks and
  synthesizes every environment.
- **deploy.yml**: staging deploys automatically when CI passes on `main`. Production is started by
  hand (Actions → Deploy → Run workflow → production) and waits for the reviewers set on the GitHub
  `production` environment. `cdk deploy` builds the image, updates infrastructure and rolls the
  service; ECS rolls back automatically if new tasks fail their health check. Ends with a smoke test.
- **staff-setup.yml**: creates a staff account in a deployed environment; the one-time setup link
  goes only to CloudWatch Logs (`/taoc/<env>/app`, stream named in the run summary).

Schema migrations run in the init container of every new task, before the new code starts, under
an advisory lock. They must stay backwards-compatible with the previous release (forward-only).

## First-time setup

Prerequisites on the operator's machine: Node 22+, AWS CLI v2 signed in as an administrator of the
target account (`aws configure sso` or `aws configure`). Docker is **not** needed locally; GitHub
builds the image.

1. Fill in `infra/config/staging.json`: `account`, `siteUrl`, `certificate`, `alarmEmail`,
   `github.repo`, email addresses. Commit and push.
2. Bootstrap CDK and create the deploy role:
   ```
   cd infra && npm ci
   npx cdk bootstrap aws://<account>/ap-south-2
   npx cdk deploy Taoc-staging-Ci -c env=staging
   ```
3. In GitHub → Settings → Environments, create `staging` (and later `production` with required
   reviewers and "main only"). Add environment variable `AWS_DEPLOY_ROLE_ARN` = the `DeployRoleArn`
   output of step 2 (and `AWS_REGION` if not ap-south-2).
4. Run Actions → Deploy (staging). The first run takes ~20–30 min (database creation).
   - Certificate without Route 53: while the run waits on the certificate, open ACM in the AWS
     console and add the CNAME it shows at your DNS provider. Or create the certificate first and
     put its ARN in `certificate.arn`.
   - Then point the domain at the `LoadBalancerDns` output (CNAME), unless Route 53 does it.
5. Run Actions → Create staff account for each Super Admin; send each setup link privately.
6. If email goes through SES: verify the sending domain (DKIM records) and request production
   access (out of the sandbox). If SES is not offered in ap-south-2, set `email.sesRegion`
   (e.g. `ap-south-1`).
7. Subscribe to the alarm email (AWS sends a confirmation link to `alarmEmail`).

Repeat with `production.json` / `Taoc-production-Ci` for production. Set
`github.createOidcProvider` to `true` only for the first environment in each AWS account.

## Feature switches (per environment, in `infra/config/<env>.json` → `features`)

| Switch | Default | Turn on when |
|---|---|---|
| `intakeEnabled` | staging on, production **off** | go-live approval recorded |
| `indexingEnabled` | off | clinical/content approval recorded (until then every page is noindex) |
| `clinicalImagesEnabled` | off | ADR-15/16 approvals recorded (the bucket and key already exist) |
| `oidcEnabled` | off | Cognito/Google configured (OIDC_* settings still to be added to the stack) |

Changing a switch = edit the JSON in a pull request → merge → deploy.

### Virtual screening and WhatsApp (additional setup)

- **Switch:** `VIRTUAL_SCREENING_ENABLED` (off until ADR-19 approvals). Uses the clinical bucket and key.
- **Clinical bucket CORS** (browsers upload photos straight to S3 with presigned PUTs): allow
  `PUT` from the site origin only, header `content-type`, max age 600. Add a **lifecycle rule** that
  deletes `quarantine/` objects after 1 day (normally the app deletes them within seconds).
- **CSP:** `connect-src` automatically includes the clinical bucket when `STORAGE_DRIVER=s3`.
- **WhatsApp:** set `NOTIFY_DRIVER=whatsapp`, `WHATSAPP_TOKEN` (permanent System User token),
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `NOTIFY_CLINIC_NAME`, `NOTIFY_CLINIC_PHONE`
  (secrets via Secrets Manager / the server's protected env file, never git). In Meta App → WhatsApp →
  Configuration, set the webhook URL to `https://<site>/api/webhooks/whatsapp` and the verify token to
  the value printed by `npm run whatsapp:verify-token`, and
  subscribe to `messages`. Templates must be approved with the exact names and wording in
  `src/lib/shared/virtual.ts`.
- Until templates are approved keep `NOTIFY_DRIVER=console`: nothing is sent and doctors are told to
  call the participant.

## Sizing and approximate cost (USD/month, before tax; check the AWS Pricing Calculator)

| | Staging | Production |
|---|---|---|
| App | 1 × 0.5 vCPU / 1 GB | 2–6 × 1 vCPU / 2 GB (CPU autoscaling) |
| Database | db.t4g.micro, single-AZ, 20 GB, 7-day backups | db.t4g.small, Multi-AZ, 50 GB, 35-day backups |
| Estimate | ~$60–80 | ~$170–230 |

Main cost items: load balancer (~$20), WAF (~$10 + requests), database, Fargate, public IPv4
addresses ($3.6 each), KMS keys ($1 each). There is no NAT gateway (saves ~$35+/month).

## Operations

- **Logs**: CloudWatch `/taoc/<env>/app` (streams `app/…` and `migrate/…`); database logs under
  `/aws/rds/instance/…/postgresql`; ALB access logs in the `AlbLogsBucket`.
- **Alarms** (email): 5xx errors, unhealthy tasks, WAF block spikes, DB CPU, DB storage, DB connections.
- **Rollback**: a release whose tasks fail health checks is rolled back by ECS automatically. To
  undo a release that is healthy but wrong, revert the commit on `main` (staging redeploys), then
  run Deploy → production. Migrations are forward-only; write a compensating migration rather
  than editing an applied one.
- **Secrets**: `taoc/<env>/data-encryption-key` must never be lost or changed: it decrypts stored
  MFA secrets. All secrets, keys, buckets and the database are retained if a stack is deleted.

## Backup and restore drill

Restore the latest snapshot (or a point in time) to a new instance, point a staging deploy at it,
run `GET /api/admin/audit?verify=1` and spot-check that photos load from S3. Record the RPO/RTO
achieved (ADR-08).

## Still to do before production

- Technical-owner approval of ADR-18 (design, sizing, budget); security sign-off (SECURITY_AUDIT.md).
- Load test against staging (ADR-10).
- OIDC (Cognito/Google) wiring in the stack, if `oidcEnabled` will be used.
- Decide whether staging and production share an AWS account (separate accounts recommended).
