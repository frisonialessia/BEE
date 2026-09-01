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

Full reference: `apps/api/.env.example`

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

### 2. `IngestionWorker` is in-process (`asyncio.Queue`)

Starts automatically on boot when `EXTERNAL_INGESTION_ENABLED=true`. For
**multi-instance** deployments, consider a Redis-backed queue (future work)
so enrichment tasks aren't lost on restart.

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

There is no self-serve "forgot password" flow yet. `POST
/api/v1/internal/support/reset-password` is a single emergency action for
the BEE team (not customer-facing): given an email, it generates a new
temporary password and returns it exactly once — whoever calls it relays it
out-of-band to the affected person.

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
