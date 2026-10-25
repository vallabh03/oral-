# Telangana Against Oral Cancer — DRIVE SAFE platform

Public campaign website + participant intake (with consented identity photo capture) + clinician,
Super Admin and Assistant workspaces, built from *DRIVE SAFE PRD v1.1*.

> Pre-production. Clinical wording, consent text, retention and the lesion rule (ADR-05) are drafts
> pending named approval. Do not enable live intake until the PRD §12.4 sign-off is recorded.

## Quick start (local, synthetic data)

```bash
npm install
cp .env.example .env.local            # then set APP_ENV=development
npm run seed:dev                      # staff accounts + camps + 6 synthetic participants with photos
npm run build && npm start            # http://localhost:3000
```

`npm run seed:dev` writes test credentials (password + TOTP secret) to `.dev-credentials.json`
(git-ignored). Add the TOTP secret to an authenticator app, or print a current code with
`npx tsx --conditions=react-server scripts/dev-otp.ts doctor@example.test`.

Embedded PGlite is single-process: stop the server before running `seed:dev` or `next build`.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Unit + integration + security regression (Vitest, in-memory Postgres) |
| `npm run test:e2e` | Playwright on desktop / tablet / mobile: public site, a11y (axe), responsive 320–2560 px, participant photo flow, clinician workflow, role boundaries |
| `npm run test:regression` | Everything above |
| `npm run load:photos` | 5,000 records × 50 concurrent sessions: photo upload burst, photo-backed list retrieval, mixed load |
| `npm run audit:seo` | SEO release gate against a running build (`SEO_BASE=…`) |
| `npm run audit:secrets` | Secret scan of working tree and git history |
| `npm run db:migrate` | Apply SQL migrations (pipeline step before deploying code) |
| `npm run admin:create -- <email>` | Bootstrap the first Super Admin (prints a one-time setup link) |

## Structure

```
src/app/(public)/        public site (SSR, SEO metadata, JSON-LD, breadcrumbs)
src/app/register/        participant intake (noindex) — under (public)
src/app/workspace/       staff workspaces (auth)/(app) — noindex, server-guarded
src/app/api/             route handlers, all wrapped by lib/server/http.ts
src/lib/server/          config, db, security, authz, audit, storage, images, services
src/lib/shared/          constants, questionnaire protocol, classification engine, analytics allowlist
src/components/          server components + client/ interactive components
tests/{unit,integration,security,e2e}
.claude/agents/          SDLC workstream agents (PRD §13)
docs/                    architecture, security audit, traceability, deployment, decisions, staff guide
```

See `docs/ARCHITECTURE.md` for the photo capture/storage design and `docs/SECURITY_AUDIT.md`
for checklist evidence.
