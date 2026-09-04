# BEE — Deployment Checklist

> **Deployment bible** — complete this checklist before enabling real traffic
> (public webhooks, production frontend, external enrichment).

Backend status after External Ingestion: **Ready**.

---

## 1. Required environment variables (security)

| Variable | Action |
|----------|--------|
| `API_SECRET_KEY` | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` — protects all REST endpoints |
| `JWT_SECRET_KEY` | Generate the same way as `API_SECRET_KEY` — the default `change-me-in-production` makes the app **refuse to start** when `ENVIRONMENT=production` |
| `WEBHOOK_SIGNATURE_REQUIRED` | `true` in production |
| `WEBHOOK_SIGNING_SECRET` | Strong random secret — the default `change-me-in-production` is **not** safe |
| `LINKEDIN_WEBHOOK_SECRET` | Per-provider HMAC secret for `/api/v1/webhooks/receive` |
| `G2_WEBHOOK_SECRET` / `GOOGLE_WEBHOOK_SECRET` | Configure when those providers are active |
| `ENVIRONMENT` | `production` (enables HSTS headers) |
| `EMAIL_SMTP_HOST` / `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASSWORD` / `EMAIL_FROM_ADDRESS` | **Required for self-serve password recovery.** `POST /auth/forgot-password` always answers a generic 200 and hands the email to `EmailProvider`, which only *mock-logs* it while SMTP is unset — the customer sees "check your inbox" and nothing arrives. The app logs a `CRITICAL` hardening warning at boot in `ENVIRONMENT=production` until this is set. |
| `SIGNUP_INVITE_CODE` | Optional — only set this during a closed beta. Unset (default) means `/auth/register` is fully open self-serve. See §7. |

### Database

```bash
# Migrations (all domain tables + the pgvector Sales DNA table):
cd apps/api && alembic upgrade head   # or: make api-migrate

# pgvector extension (one-time — only if the target Postgres doesn't already
# have it preinstalled; docker-compose.yml and migration 001 already handle this):
CREATE EXTENSION IF NOT EXISTS vector;
```

> Use `init_db()` for local dev only. In production, **always Alembic**.

> **Vercel does not run migrations for you.** A `git push` redeploys the API
> with the new models, but the database keeps the old schema until someone
> runs `alembic upgrade head` against it — and every request that touches a
> missing column then fails with a 500 (login included). This is exactly what
> broke production on 2026-09-04: the code was at revision 047 while Supabase
> sat at 028. After **every** deploy that adds a file under
> `apps/api/alembic/versions/`, run, with `DATABASE_URL` pointing at
> production:
>
> ```bash
> cd apps/api && alembic upgrade head
> ```
>
> No direct DB access? `alembic upgrade <current>:head --sql` emits the exact
> SQL, which you can paste into the Supabase SQL editor. `env.py` widens
> `alembic_version.version_num` automatically (Alembic bootstraps it as
> VARCHAR(32) and some of our revision ids are longer).

> On Vercel specifically, use your Postgres provider's **pooled**
> connection string for `DATABASE_URL` — see gotcha §3.7 below before
> opening traffic to more than one person at a time.

---

## 2. Recommended variables (competitive edge)

| Variable | Purpose |
|----------|---------|
| `VECTOR_STORE_BACKEND=pgvector` | Persistent Sales DNA memory |
| `AI_PROVIDER=openai` + `AI_API_KEY` | LLM-powered strategy/artifact generation |
| `LINKEDIN_ACCESS_TOKEN` | Real LinkedIn profile enrichment (mock fallback without it) |
| `EXTERNAL_INGESTION_ENABLED=true` | Starts `IngestionWorker` on app boot |
| `CRON_SECRET` + `MARKET_SCAN_ENABLED=true` | Proactive market scan (Vercel Cron) — see §3.8 below |
| `ACCOUNT_RESEARCH_ENABLED=true` | Deep per-account research (AccountResearchAgent) — see §3.9 below |
| `SENDGRID_WEBHOOK_SECRET` / `RESEND_WEBHOOK_SECRET` | Email open/click/reply → DarkFunnel signals — see §3.9 below |
| `SENTRY_DSN` (backend, `apps/api/.env.example`) + `NEXT_PUBLIC_SENTRY_DSN` (frontend, `apps/web/.env.example`) | Error monitoring — unset means zero error visibility in production, not a crash; set both before real traffic if you want to know when something breaks |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Distributed tracing — unset means `setup_tracing()` is a no-op, no collector needed to run this app |
| `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` + `WORKOS_REDIRECT_URI` | Enterprise SSO (SAML/OIDC via WorkOS) — unset means the `/auth/sso/*` endpoints 404; each customer organization also needs `sso_enabled`/`sso_connection_id`/`sso_domain` set via `PATCH /organizations/me/sso` (OWNER only) even once these are configured |
| `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` | Billing scaffolding — unset means the `/billing/*` endpoints fail gracefully; scaffolding only, nothing in this codebase gates access on subscription status (see `app.services.billing`'s module docstring) |
| `NEXT_PUBLIC_POSTHOG_KEY` (frontend, `apps/web/.env.example`) | Product analytics — unset means `posthog-js` is never initialized, no PostHog account needed to run this app |

Full reference: `apps/api/.env.example` and `apps/web/.env.example`

---

## 3. Gotchas — manual steps (read before opening traffic)

### 1. `/api/v1/webhooks/receive` is exempt from API key auth

Authenticated by **per-provider HMAC** instead of `X-API-Key`. Do not remove
this exemption — external systems cannot send `X-API-Key`.

Also protected against replay: the same signature is not accepted twice
within `WEBHOOK_REPLAY_WINDOW_SECONDS` (default 300s; `0` disables the
check — see `app.core.replay_guard`).

For inbound signals/dark-funnel data on this endpoint to be tagged with an
`organization_id` (instead of "untagged", visible instance-wide), configure
the URL given to each provider with `?org_key=<organization's key>` — or, if
the provider supports custom headers, `X-BEE-Org-Key`. Without either, the
behavior is the same as always (untagged).

### 1b. Customers push signals with their organization API key, not the HMAC secret

`POST /api/v1/signals/webhook` accepts either the server-wide
`X-BEE-Signature` HMAC **or** a per-organization `X-BEE-Org-Key` (minted in
the dashboard under Integrations → Señales entrantes). Never hand
`WEBHOOK_SIGNING_SECRET` to a customer — it is one value shared by every
tenant. Point their CRM/Zapier/script at the webhook with their own key;
the request is authenticated and tenant-scoped by that key alone.

### 2. `IngestionWorker` is in-process (`asyncio.Queue`) by default

Starts automatically on boot when `EXTERNAL_INGESTION_ENABLED=true`. On a
**serverless** deployment (Vercel — this project's actual target, see §7
below) this is more than a multi-instance inconvenience: a queued task
lives only in one function invocation's memory, so it can vanish entirely
the moment that invocation suspends — there is no "later" for an
in-process queue to survive into.

The durable alternative (no longer future work) is `JOB_QUEUE_BACKEND=redis`
— see `app.services.job_queue` and `app.services.external_api.worker.
run_job_queue_tick`. Requires:
1. `REDIS_URL` set (see §Shared state below).
2. `apps/api/vercel.json`'s `/api/v1/internal/jobs/tick` cron entry
   deployed (drains a batch every minute — same `CRON_SECRET`-gated,
   Vercel-Cron-only shape as the market-scan tick in §8).
3. Nothing else — `IngestionWorker.enqueue()` falls back to the in-process
   queue automatically if the durable push ever fails, so this is safe to
   flip on incrementally and never loses a task by switching backends.

### 2b. Shared state (Redis, opt-in) — `REDIS_URL`

Backs the durable job queue above *and* every per-process rate
limiter/guard already in this codebase (signup, password-reset, webhook
replay protection, the external-provider rate limiter) — see
`app.core.redis`'s module docstring. Unset (the default) keeps every one
of those exactly as they behave without it: process-local, correct for a
single warm instance, just not shared across concurrent ones. Set this
once the deployment runs more than one instance at a time and those
guards need to hold their quota/state across all of them — no other flag
needed for the guards (only the job queue also needs
`JOB_QUEUE_BACKEND=redis` on top, since that one changes *how* tasks are
processed, not just where a counter lives).

### 3. pgvector on managed Postgres (outside docker-compose)

`docker-compose.yml` already uses the `pgvector/pgvector:pg16` image (with
the extension preinstalled), so `make up` / `docker compose up --build`
works with no extra steps. If production uses a **managed** Postgres (RDS,
Cloud SQL, Supabase, etc.) instead of that image, confirm it supports
pgvector and run `CREATE EXTENSION IF NOT EXISTS vector;` (migration
`001_pgvector_sales_dna` also attempts this, but it only works if the
extension is available on the server) **before** setting
`VECTOR_STORE_BACKEND=pgvector`.

### 4. LinkedIn API requires OAuth app approval

Without `LINKEDIN_ACCESS_TOKEN`, BEE uses deterministic mock profiles (safe
for staging, **not** valid for real production enrichment).

### 5. The frontend must send `X-API-Key`

On every API call, when `API_SECRET_KEY` is set. Configure
`NEXT_PUBLIC_BEE_API_KEY` in the Next.js app (see `apps/web/.env.example`).
Note: `/auth/register` and `/auth/login` are the exception — they're
always reachable without `X-API-Key` since they're the public self-serve
entry points (see `app/core/middleware.py`).

### 6. Post-deploy dry run

Verify the full pipeline after every deploy:

```bash
python scripts/simulate_signal.py --mode http --base-url https://your-api.example.com
```

Local mode (no server required):

```bash
python scripts/simulate_signal.py
python scripts/simulate_signal.py --failure   # validates safe logging when LinkedIn is down
```

### 7. Postgres connection pooling on serverless (Vercel)

`engine` (`app.core.database`) is a module-level object shared across the
app's own lifetime — but on Vercel that's one *function instance*, not one
long-lived server process. Real concurrent traffic can spin up several
instances at once, and `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` (defaults: 2 + 3 —
see `Settings` in `app.core.config`) apply **per instance**, not globally.
Two things, both matter:

- **Point `DATABASE_URL` at your provider's pooled connection string**, not
  the direct one — Neon's host with `-pooler` in it, Supabase's
  transaction-mode port (`6543` instead of `5432`), or your own PgBouncer.
  This is what actually keeps many concurrent instances from exhausting
  Postgres' own connection cap; the small pool defaults help, but aren't a
  substitute for it.
- If you deliberately raise `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` for a
  higher-throughput deployment, multiply by however many concurrent
  instances your Vercel plan/config can actually run to sanity-check
  against your Postgres provider's connection limit — not just the number
  itself.

Symptom if this is wrong: intermittent `"too many connections"` errors
under real concurrent load that never reproduce testing alone.

### 8. Proactive market scan (`CRON_SECRET` / `MARKET_SCAN_ENABLED`)

`apps/api/vercel.json` declares a Vercel Cron Job hitting
`GET /api/v1/internal/market-scan/tick` every 15 minutes — this ships
enabled at the infra level regardless of the feature flag below, so **until
you set `CRON_SECRET`, every one of those invocations 404s** (visible as a
failed run in Vercel's Cron dashboard — harmless, no data touched, but
expect to see it until you configure the secret).

The same `CRON_SECRET` gates the two other cron routes in that file:
`/api/v1/internal/jobs/tick` (every minute, the durable job queue) and
`/api/v1/internal/digest/tick` (hourly — posts "La jugada de hoy" to each
organization's Slack/Teams webhook at the hour its admin picked under
Integraciones → Resumen diario; nothing is sent for organizations that
haven't configured one).

1. Set `CRON_SECRET` (exact name — Vercel auto-injects
   `Authorization: Bearer $CRON_SECRET` on cron-triggered requests only when
   the project env var is named exactly this). Generate the same way as
   `API_SECRET_KEY`. This alone only fixes the 404s — the tick still no-ops
   (`enabled: false` in the response) until the next step.
2. Set `MARKET_SCAN_ENABLED=true` to let ticks actually pick up due
   companies. As of this writing `_scan_company` is still a Phase 1
   placeholder (see `app.services.market_scan.orchestrator`'s docstring) —
   turning this on exercises the scheduling/cursor/audit-log pipeline
   end-to-end, but produces 0 signals until a real provider (Google/hiring)
   is wired into it.
3. Requires migration `026_market_scan_scaffold` (`Company.next_scan_due_at`
   / `.last_scanned_at`, the `market_scan_logs` table) — run
   `alembic upgrade head` before setting either variable above.
4. Check `market_scan_logs` after a few ticks to confirm it's actually
   running (`companies_scanned`, `duration_ms` per tick) before trusting it.

### 9. Data-Entry Zero — AccountResearchAgent + email engagement events

1. Requires migration `027_account_briefs` (`account_briefs` table) — run
   `alembic upgrade head` before setting `ACCOUNT_RESEARCH_ENABLED=true`.
2. `ACCOUNT_RESEARCH_ENABLED=false` is the default — `POST
   /companies/{id}/research` and the owner-assignment auto-trigger both
   work and return a real (empty) response either way, but no provider is
   ever called until this is true. See
   `app.services.account_research.agent`'s module docstring for the full
   cache/budget discipline (`ACCOUNT_RESEARCH_TTL_DAYS`,
   `ACCOUNT_RESEARCH_DAILY_BUDGET_PER_ORG`) before turning it on for a
   real account with real provider credentials configured.
3. `SENDGRID_WEBHOOK_SECRET`/`RESEND_WEBHOOK_SECRET` sign **BEE's own**
   HMAC scheme on `POST /api/v1/webhooks/receive` (`X-BEE-Signature` /
   `X-Provider-Signature`), not SendGrid's native ECDSA event signing or
   Resend's native Svix headers — wiring a real account needs a small
   adapter in front of this endpoint that verifies the provider's own
   signature and re-signs with this scheme before forwarding. See that
   endpoint's docstring ("Email engagement events") for the exact event
   shape it expects.

### 10. Guardrail Backtesting, Revenue Continuity Radar & Federated Signal Intelligence

Three additive modules, all ship OFF by default — safe to deploy to an
existing pilot with zero behavior change until each is individually
enabled.

1. Requires migrations `031_opportunity_type` (`Opportunity.opportunity_type`)
   and `032_federated_intelligence_opt_in`
   (`Organization.federated_intelligence_opt_in`) — run `alembic upgrade
   head` before opening traffic. Both backfill every existing row to the
   status-quo value (`new_logo` / `false`), so no existing opportunity's
   classification or organization's participation changes on upgrade.
2. **Guardrail Backtesting Sandbox** (`POST
   /organizations/autopilot/simulate`) needs no flag — it is read-only and
   requires only that Autopilot itself has been configured
   (`PUT /organizations/autopilot`, OWNER-only) to have anything meaningful
   to backtest against. Safe to leave as-is; there is nothing to turn on.
3. **Revenue Continuity Radar** (`opportunity_type` classification +
   lifecycle-aware playbooks) needs no flag either — it activates
   automatically, per organization, the first time that organization has a
   WON opportunity for a company a later signal targets again. Nothing to
   configure; verify it by checking a re-triggered signal's
   `Opportunity.opportunity_type` in the pipeline once a pilot org has its
   first WON deal.
4. **Federated Signal Intelligence** is opt-in per organization
   (`PUT /organizations/federated-intelligence`, OWNER-only) — set
   `FEDERATED_INTELLIGENCE_MIN_CONTRIBUTING_ORGS` (default `3`) based on
   pilot size before any organization opts in: with a >500-account pilot
   cohort, the default 3-org floor is appropriate at launch, but revisit it
   upward (`15`-`20`) once enough organizations have opted in that a higher
   floor still clears routinely — see that setting's own comment in
   `.env.example` / `app.core.config`.

---

## 4. Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/health` | Liveness (no auth) |
| `GET /api/v1/ready` | DB connectivity |
| `GET /api/v1/status` | Deep subsystem check (DB, vector store, DLQ, security) |
| `GET /api/v1/webhooks/status` | Ingestion worker queue depth + provider config |

---

## 5. Suggested deployment order

1. Provision Postgres with pgvector
2. Configure secrets (API key, webhook HMAC, external tokens)
3. `alembic upgrade head`
4. Deploy the API with `ENVIRONMENT=production`
5. Verify `/api/v1/ready` and `/api/v1/status`
6. Run the dry run (`scripts/simulate_signal.py --mode http`)
7. Open webhooks to the public internet (see security recommendations in README §4)
8. Deploy the frontend with `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_BEE_API_KEY`

---

## 6. Frontend — Vercel (monorepo)

The Next.js frontend lives in **`apps/web/`**. The repo does **not** have an
`app/` directory at the root — if Vercel points at the monorepo root, the
build fails with `Couldn't find any app directory` and routes 404.

### Required Vercel configuration

> **Common mistake:** if Root Directory = `apps/web` and Output Directory =
> `apps/web/.next`, Vercel looks for `apps/web/apps/web/.next` → 404 / build
> failed. Output Directory must be **`.next`** (or empty) when Root Directory
> = `apps/web`.

**Option A — Root Directory = `apps/web` (recommended for Next.js):**

| Setting | Value |
|---------|-------|
| **Root Directory** | `apps/web` |
| **Install Command** | `cd .. && pnpm install --frozen-lockfile --filter web` |
| **Build Command** | `pnpm build` |
| **Output Directory** | `.next` *(or leave empty — never `apps/web/.next`)* |

Repo config: `apps/web/vercel.json`

**Option B — Root Directory = repo root:**

| Setting | Value |
|---------|-------|
| **Root Directory** | *(empty / `.`)* |
| **Install Command** | `pnpm install --frozen-lockfile` |
| **Build Command** | `pnpm --dir apps/web build` |
| **Output Directory** | `apps/web/.next` |

Repo config: `vercel.json` (root)

The canonical lockfile lives at the repo **root** (`pnpm-lock.yaml`).

### Environment variables (Production + Preview)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Public URL of the FastAPI backend (e.g. `https://api.yourdomain.com`) |
| `NEXT_PUBLIC_BEE_API_KEY` | Same value as the backend's `API_SECRET_KEY` |

### Post-deploy verification

After deploying, confirm the build log includes:

```
○ /dashboard/control
○ /dashboard
○ /dashboard/signals
```

Test URLs:

- `/` — landing
- `/dashboard` — overview
- `/dashboard/control` — operator panel (redirects from `/control`)

### Reference files in the repo

| File | Purpose |
|------|---------|
| `apps/web/vercel.json` | Install/build commands for Vercel |
| `apps/web/next.config.ts` | Redirect `/control` → `/dashboard/control` |
| `apps/web/src/app/dashboard/control/page.tsx` | App Router route |
| `apps/web/.env.example` | Variable template |

---

## 7. Open registration — invite code and signup rate limit

`POST /auth/register` is open self-serve by design: anyone with the URL
creates a new organization, with no email verification and no admin
approval — that's the intended product model (see `AuthService.register_organization`).
If you want a curated closed beta instead, two protection layers are
available (see `app.core.signup_guard`):

1. **`SIGNUP_INVITE_CODE`** — when set, `/auth/register` requires that code
   (timing-safe comparison). Left unset, registration is fully open — the
   default, intended behavior. The `/register` form's invite-code field is
   optional in the frontend since it doesn't know whether the backend
   requires one; if the backend does and it doesn't match, it returns 403.
2. **`SIGNUP_RATE_LIMIT_PER_HOUR`** (default `5`) — a per-IP limit,
   independent of the invite code above (protects even if the code leaks or
   someone brute-forces it). `0` disables it.

Both are in-process memory, same as `WEBHOOK_REPLAY_WINDOW_SECONDS` — they
don't persist across restarts or share state across instances (see gotcha
#2 above).

---

## 8. Internal support tool — emergency password reset

Self-serve recovery exists (`POST /auth/forgot-password` → email a reset
link → `POST /auth/reset-password`), works out of the box with sane
defaults, and needs nothing new configured — it reuses `EMAIL_SMTP_*`
(§2 above; mock-logs the email instead of sending when unconfigured) and
`FRONTEND_URL` (for the link in the email). Two optional knobs if the
defaults don't fit: `PASSWORD_RESET_RATE_LIMIT_PER_HOUR` (default `5`,
per-IP) and `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` (default `60`).

`POST /api/v1/internal/support/reset-password` remains a *separate*,
BEE-team-only emergency action (not the customer path above): given an
email, it generates a new temporary password and returns it exactly once —
whoever calls it relays it out-of-band to the affected person. Useful when
a customer can't receive email at all, or as a break-glass tool.

- **`SUPPORT_ADMIN_SECRET`** — unset by default, in which case the endpoint
  404s and doesn't exist. Only configure it if this tool is genuinely
  needed, and give it to very few people. Generate with
  `python -c "import secrets; print(secrets.token_hex(32))"` — **never**
  reuse `API_SECRET_KEY` or `JWT_SECRET_KEY` for this.
- Usage: `POST /api/v1/internal/support/reset-password` with header
  `X-BEE-Support-Secret: <secret>` and body `{"email": "..."}`.
- Deliberately **not** an in-app admin role that can see any organization's
  data — that would reopen the same cross-tenant isolation risk the rest of
  this project exists to close. For any other emergency intervention (fixing
  a row, etc.), use the database provider's own dashboard directly.

---

*Last updated: External Ingestion phase — backend Ready.*
