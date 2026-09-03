"""Application configuration.

All runtime configuration is centralized here and loaded from environment
variables (or a local ``.env`` file) using :mod:`pydantic-settings`.

Design rationale
----------------
* **Single Responsibility**: this module is the *only* place that knows how
  configuration is sourced. The rest of the codebase depends on the typed
  :class:`Settings` object, never on ``os.environ`` directly.
* **Security first**: secrets (database credentials, webhook signing keys, AI
  provider keys) never live in the codebase. They are injected through the
  environment. ``.env`` is git-ignored; ``.env.example`` documents the contract.
* **Dependency Inversion**: consumers import :func:`get_settings`, which returns
  a cached singleton, so the concrete source of configuration can change without
  touching call sites.
"""

from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings.

    Every attribute maps to an environment variable of the same (upper-cased)
    name. Validation happens at startup, so misconfiguration fails fast and
    loudly instead of surfacing as an obscure runtime error later.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ----- Application metadata ------------------------------------------------
    PROJECT_NAME: str = "BEE - Sales Force Intelligence"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # ----- Persistence ---------------------------------------------------------
    # A full DSN can be provided directly (e.g. by a managed Postgres provider),
    # otherwise it is assembled from the discrete parts below.
    DATABASE_URL: PostgresDsn | str | None = None
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "bee"
    POSTGRES_PASSWORD: str = "bee"
    POSTGRES_DB: str = "bee"
    # SQLAlchemy's own defaults (pool_size=5, max_overflow=10 — up to 15
    # connections) assume one long-lived process holding one pool for the
    # app's whole lifetime. That's wrong here: `engine` (app.core.database)
    # is a module-level object, so on a serverless platform (Vercel) it's
    # actually "up to 15 connections *per warm function instance*", and
    # concurrent traffic can spin up many instances at once — a handful of
    # them is already enough to exhaust a typical managed Postgres'
    # connection cap, surfacing as intermittent "too many connections"
    # errors that never reproduce with one person testing at a time. Kept
    # small and configurable (not hardcoded) because the right number
    # depends on how many instances the deployment can run concurrently —
    # see DEPLOY_CHECKLIST.md for the pooled-connection-string
    # recommendation this pairs with (PgBouncer/Neon's "-pooler" host/
    # Supabase's transaction-mode port), which matters more than either of
    # these two numbers on its own.
    DB_POOL_SIZE: int = 2
    DB_MAX_OVERFLOW: int = 3

    # ----- Shared state (Redis, opt-in) -----------------------------------------
    # See app.core.redis. Every per-process guard/limiter in this codebase
    # (signup_guard, password_reset_guard, replay_guard, rate_limiter, the
    # /contact per-IP limiter) already documents itself as "sufficient for
    # a single instance, needs a shared store for multi-instance" — this is
    # that shared store. Unset (the default) keeps every one of them exactly
    # as they behave today: process-local, zero behavior change. Setting
    # this alone is enough — no other flag needed — each guard checks for a
    # reachable Redis client itself and falls back to local state per-call
    # if the client is absent or a Redis command fails, so a Redis outage
    # degrades to today's behavior rather than taking any guard down.
    REDIS_URL: str | None = None

    # ----- Secrets vault ---------------------------------------------------------
    # SecretManager (app/services/secret_manager) resolves every external-API
    # credential from the environment by default — "env" keeps that behavior
    # exactly. Setting SECRET_BACKEND="aws_secrets_manager" makes it consult a
    # single AWS Secrets Manager secret first (a JSON object keyed by the same
    # env-var names, e.g. {"LINKEDIN_ACCESS_TOKEN": "..."}), falling back to
    # the environment for any key not present there — so a partially-populated
    # AWS secret degrades gracefully instead of breaking providers that
    # haven't been migrated to it yet. See secret_manager/aws_backend.py.
    SECRET_BACKEND: Literal["env", "aws_secrets_manager"] = "env"
    AWS_SECRETS_MANAGER_SECRET_ID: str | None = None
    AWS_REGION: str | None = None

    # ----- Security ------------------------------------------------------------
    # Shared secret used to verify HMAC signatures on incoming webhooks so that
    # only trusted upstream integrations can push signals into the engine.
    #
    # Defaults to a fresh random secret generated at process start rather than
    # a static placeholder: since nothing knows this value, every unsigned (or
    # wrongly-signed) request is rejected out of the box. Wiring up a real
    # provider webhook later requires explicitly setting this to whatever
    # shared secret that provider signs with anyway — this default only
    # closes the gap where NEITHER var was ever configured (see
    # WEBHOOK_SIGNATURE_REQUIRED below and .env.example for local dev, which
    # explicitly sets both so this random default never applies there).
    WEBHOOK_SIGNING_SECRET: str = Field(default_factory=lambda: secrets.token_hex(32))
    # Secure by default: unsigned webhooks are rejected unless a deployment
    # explicitly opts out (local dev's .env.example/docker-compose already do).
    WEBHOOK_SIGNATURE_REQUIRED: bool = True
    # Replay-attack window for /webhooks/receive: a request whose exact
    # (provider, signature) pair was already accepted within this many
    # seconds is rejected as a captured-and-replayed request, independent of
    # whether the payload it carries is otherwise valid. 0 disables the
    # check entirely (useful for tests that intentionally POST the same
    # signed payload twice). Per-process only — same in-process limitation
    # as IngestionWorker itself (see README §7 gotcha #2); a multi-instance
    # deployment needs a shared store (Redis) for this to hold across
    # instances, same future work already called out for the queue.
    WEBHOOK_REPLAY_WINDOW_SECONDS: int = 300

    # API Key authentication for REST endpoints.
    # When set, all non-health endpoints require the header:
    #   X-API-Key: <value>
    # Set to None to disable (development mode).
    API_SECRET_KEY: str | None = None
    # Comma-separated list of paths exempt from API key auth (exact prefix match).
    # /api/v1/health and /api/v1/ready are always exempt.
    # /api/v1/integrations/{gmail,linkedin}/callback are exempt too: each is
    # hit by a plain browser redirect from the provider, which carries
    # neither X-API-Key nor our Authorization bearer — they authenticate via
    # their own signed ``state`` param instead (see
    # app.core.security.decode_oauth_state_token).
    # /api/v1/internal/market-scan/tick and /api/v1/internal/jobs/tick are
    # exempt too: Vercel Cron issues a plain GET with only the
    # Authorization: Bearer $CRON_SECRET header it auto-injects (see
    # CRON_SECRET below) — it cannot also be configured to send X-API-Key.
    # That Bearer check is each path's real authentication; if you override
    # this value, keep both paths listed or their cron ticks will start
    # requiring an API key Vercel will never send.
    API_KEY_EXEMPT_PATHS: str = (
        "/api/v1/health,/api/v1/ready,/api/v1/webhooks/receive,/api/v1/contact,"
        "/api/v1/integrations/gmail/callback,/api/v1/integrations/linkedin/callback,"
        "/api/v1/integrations/salesforce/callback,/api/v1/internal/market-scan/tick,"
        "/api/v1/internal/jobs/tick"
    )

    # ----- Multi-tenant user auth (Organization / Team / User) ------------------
    # Distinct from API_SECRET_KEY above: API_SECRET_KEY gates service-to-service
    # calls (the frontend, integrations) with one shared secret. JWT_SECRET_KEY
    # signs per-user session tokens issued at login, carrying the user's identity
    # and role so endpoints can enforce organization/team-scoped visibility.
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    # bcrypt work factor. 12 is bcrypt's own default — a good balance of
    # brute-force resistance vs. login latency; raise only with load testing.
    PASSWORD_HASH_ROUNDS: int = 12

    # ----- Signup abuse protection (see app.core.signup_guard) ------------------
    # POST /auth/register is open self-serve with no email verification — set
    # this during a controlled beta so registration also requires a shared
    # code (distributed out-of-band to invited testers), checked with a
    # timing-safe comparison. None (the default) keeps registration fully
    # open, same as before this existed.
    SIGNUP_INVITE_CODE: str | None = None
    # Per-IP registration attempts allowed per rolling hour, independent of
    # the invite code above (a leaked/brute-forced code still hits this). 0
    # disables the check entirely.
    SIGNUP_RATE_LIMIT_PER_HOUR: int = 5

    # ----- Login abuse protection (see app.core.login_guard) --------------------
    # POST /auth/login had no rate limiting at all until this existed — see
    # login_guard's module docstring for why this is per-IP, not per-email
    # (a per-email lock is itself a denial-of-service vector), and why the
    # default is higher than registration's: login is routine traffic a
    # shared office IP can legitimately generate many times an hour, signup
    # is a one-time action. 0 disables the check entirely.
    LOGIN_RATE_LIMIT_PER_HOUR: int = 20

    # ----- Forgot-password abuse protection (see app.core.password_reset_guard) --
    # POST /auth/forgot-password sends an email on every call for an address
    # that exists — same SignupGuard shape as registration above, reused
    # against a separate per-IP bucket so a burst of reset requests can't be
    # used to spam a real customer's inbox. 0 disables the check entirely.
    PASSWORD_RESET_RATE_LIMIT_PER_HOUR: int = 5
    # How long a reset link stays valid after POST /auth/forgot-password.
    # Short window: this token grants a full account takeover if intercepted
    # (email is rarely end-to-end encrypted), so it trades convenience for a
    # narrower exposure window than a session token would need.
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60

    # ----- Internal support tooling (see app.api.v1.endpoints.internal_support) --
    # A single narrow emergency action — reset any user's password by email —
    # gated by its own secret, entirely separate from API_SECRET_KEY (service
    # auth) and JWT_SECRET_KEY (customer sessions). None (the default)
    # disables the endpoint outright: it 404s rather than existing as a live,
    # always-on surface in deployments that never opt into it. This is
    # deliberately NOT a general cross-organization admin role — see the
    # module docstring for why that's a materially bigger, unaudited risk
    # this project isn't taking on right now.
    SUPPORT_ADMIN_SECRET: str | None = None

    # ----- Error monitoring (see app.main's lifespan) ---------------------------
    # None (the default) means sentry_sdk.init() is never called — zero error
    # visibility, but also zero behavior change and no Sentry account needed
    # to run this app. Get a DSN from sentry.io → Settings → Projects → your
    # project → Client Keys (DSN).
    SENTRY_DSN: str | None = None
    # Off by default — error capture doesn't need trace sampling, and turning
    # this on has a real cost (Sentry bills per transaction). A deployment
    # that wants tracing sets this explicitly (0.0-1.0).
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0

    # ----- CORS ----------------------------------------------------------------
    # Comma-separated list of origins allowed to call the API (the Next.js app).
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000"

    # Optional regex, matched in ADDITION to BACKEND_CORS_ORIGINS above (see
    # cors_origins' own docstring: that list is an *exact* string match).
    # Exists for exactly one situation: a Vercel project's frontend is
    # reachable at several auto-generated aliases at once (its stable
    # production alias, its git-branch alias, every unique-per-deployment
    # URL — e.g. bee-web-theta.vercel.app, bee-web-git-main-<team>.vercel.app,
    # bee-web-<hash>-<team>.vercel.app for apps/web specifically), and
    # BACKEND_CORS_ORIGINS listing only one of them means every visitor who
    # lands on a different alias gets a browser-level CORS rejection —
    # surfacing as "No se pudo conectar con el servidor" client-side with
    # nothing logged server-side (the request never reaches this API; see
    # app.core.api.client.ts's own comment on that exact string). Unset (the
    # default) changes nothing — every origin must still be listed exactly
    # in BACKEND_CORS_ORIGINS. Set it to scope a whole family of Vercel
    # aliases at once instead of enumerating each one by hand and having to
    # remember to add the next one Vercel generates — e.g.
    # ``^https://bee-web(-[a-zA-Z0-9]+)*\.vercel\.app$`` matches every alias
    # above (and any future one Vercel creates for this same project) without
    # opening CORS to any origin outside that one project's own domains.
    BACKEND_CORS_ORIGIN_REGEX: str | None = None

    # Base URL of the deployed frontend (no trailing slash) — used only to
    # build the redirect target after an OAuth callback (e.g. Google) hands
    # control back to us server-side, since that's a browser navigation, not
    # something the frontend's own fetch client controls. Distinct from
    # BACKEND_CORS_ORIGINS above (which can list several allowed origins);
    # this is the one canonical origin a human gets redirected back to.
    FRONTEND_URL: str = "http://localhost:3000"

    # ----- Third-party OAuth token storage (see app.core.token_crypto) ---------
    # Symmetric key used to encrypt OAuth access/refresh tokens (Gmail, and
    # any future integration) before they're persisted. Unset by default —
    # connecting an integration fails with a clear error until it's set,
    # same "opt-in, no silent insecure fallback" posture as every secret in
    # this file. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    TOKEN_ENCRYPTION_KEY: str | None = None

    # ----- Google OAuth (Gmail integration) -------------------------------------
    # Powers the real "Connect Gmail" flow at /dashboard/integrations — lets a
    # rep send sequence steps from their own Gmail account instead of BEE's
    # shared SMTP relay (see app.services.integrations.gmail_oauth). All three
    # come from a Google Cloud OAuth 2.0 Client ID (Web application type) that
    # only the BEE team can create — never invented or defaulted here. Unset
    # (the default) means the "Conectar Gmail" button in the dashboard shows
    # honestly as unavailable rather than pretending to work.
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: str | None = None
    # Must exactly match a Redirect URI registered on that OAuth Client —
    # e.g. https://api.yourdomain.com/api/v1/integrations/gmail/callback
    GOOGLE_OAUTH_REDIRECT_URI: str | None = None

    # ----- LinkedIn OAuth (LinkedIn integration) --------------------------------
    # Powers the real "Connect LinkedIn" flow at /dashboard/integrations — a
    # per-organization connection, distinct from LINKEDIN_ACCESS_TOKEN above
    # (a single token shared by the whole deployment) and from
    # LINKEDIN_CLIENT_ID/SECRET below (Sales Navigator profile enrichment —
    # a different LinkedIn product entirely). Comes from a "Sign In with
    # LinkedIn using OpenID Connect" + Share on LinkedIn app registered at
    # https://www.linkedin.com/developers/apps — see
    # app.services.integrations.linkedin_oauth. Unset (the default) means
    # the "Conectar LinkedIn" button shows honestly as unavailable.
    LINKEDIN_OAUTH_CLIENT_ID: str | None = None
    LINKEDIN_OAUTH_CLIENT_SECRET: str | None = None
    # Must exactly match a Redirect URL registered on that app — e.g.
    # https://api.yourdomain.com/api/v1/integrations/linkedin/callback
    LINKEDIN_OAUTH_REDIRECT_URI: str | None = None

    # ----- Salesforce OAuth (Salesforce integration) ----------------------------
    # Powers "Connect Salesforce" at /dashboard/integrations — a per-org
    # connection to a real Salesforce org, from a Connected App created in
    # Salesforce Setup (App Manager → New Connected App, enable OAuth
    # Settings). Unlike Gmail/LinkedIn, connecting is all this ships today —
    # see app.services.integrations.salesforce_oauth's module docstring for
    # why actually syncing records is deliberately NOT built yet: it needs
    # this org's real object/picklist schema, not just credentials.
    SALESFORCE_OAUTH_CLIENT_ID: str | None = None
    SALESFORCE_OAUTH_CLIENT_SECRET: str | None = None
    # Must exactly match a Callback URL on that Connected App, e.g.:
    #   https://api.yourdomain.com/api/v1/integrations/salesforce/callback
    SALESFORCE_OAUTH_REDIRECT_URI: str | None = None
    # https://login.salesforce.com for a production/Developer org,
    # https://test.salesforce.com for a sandbox. Salesforce has no single
    # fixed OAuth host the way Google/LinkedIn do.
    SALESFORCE_LOGIN_URL: str = "https://login.salesforce.com"

    # ----- HubSpot OAuth (HubSpot integration) -----------------------------------
    # Powers "Connect HubSpot" at /dashboard/integrations — a per-org
    # connection to a real HubSpot account, from a public app created in the
    # HubSpot Developer account (developers.hubspot.com → Apps → Create app
    # → Auth tab for the client id/secret/redirect URL, Scopes tab for
    # crm.objects.companies.read/crm.objects.contacts.read/
    # crm.objects.deals.read). Same "connect + one-way read import" shape as
    # Salesforce, not a two-way sync — see
    # app.services.integrations.hubspot_import's module docstring.
    HUBSPOT_OAUTH_CLIENT_ID: str | None = None
    HUBSPOT_OAUTH_CLIENT_SECRET: str | None = None
    # Must exactly match a Redirect URL on that app, e.g.:
    #   https://api.yourdomain.com/api/v1/integrations/hubspot/callback
    HUBSPOT_OAUTH_REDIRECT_URI: str | None = None

    # ----- Jira OAuth (Jira connector — opportunity-stage sync) -----------------
    # Powers "Connect Jira" at /dashboard/integrations — an Atlassian OAuth
    # 2.0 (3LO) app created at developer.atlassian.com/console/myapps (Jira
    # API scopes: read:jira-work, write:jira-work, offline_access; Callback
    # URL = JIRA_OAUTH_REDIRECT_URI below). Once connected + a project key
    # is set (PATCH /integrations/jira/config), JiraSyncHandler
    # (app.services.workflow_orchestrator.handlers) creates a Jira issue
    # when an opportunity reaches Ready to action and comments on it when
    # the deal is won/lost — see that handler's own docstring for why a
    # comment, not a workflow transition (project-specific transition IDs
    # would be too fragile to guess at).
    JIRA_OAUTH_CLIENT_ID: str | None = None
    JIRA_OAUTH_CLIENT_SECRET: str | None = None
    # Must exactly match a Callback URL on that app, e.g.:
    #   https://api.yourdomain.com/api/v1/integrations/jira/callback
    JIRA_OAUTH_REDIRECT_URI: str | None = None

    # ----- ExecutiveAgent webhook (n8n / Zapier / Make) -------------------------
    # When set, BEE fires a POST to this URL every time execution artifacts are
    # generated. The receiving workflow can then send the email, create a CRM
    # task, or trigger any downstream action.
    WEBHOOK_EXECUTION_URL: str | None = None

    # ----- ResourcePredictorService (opt-in) -------------------------------------
    # When enabled, BEE evaluates operational impact before confirming WON.
    # STRICT mode blocks the confirmation when risk_level is HIGH.
    RESOURCE_PREDICTION_ENABLED: bool = False
    RESOURCE_PREDICTION_STRICT: bool = False

    # ----- MarketScanOrchestrator (proactive market scan, opt-in) ---------------
    # See app.services.market_scan and app.api.v1.endpoints.internal_market_scan.
    # CRON_SECRET: Vercel's own reserved name — when a Vercel Cron Job invokes
    # this project's deployment, Vercel automatically sends
    # `Authorization: Bearer $CRON_SECRET` if a project env var by that exact
    # name is set (https://vercel.com/docs/cron-jobs/manage-cron-jobs). Unset
    # (the default) means the tick endpoint 404s, same "off by default, no
    # extra surface" convention as SUPPORT_ADMIN_SECRET above — it is
    # deliberately its own secret, never API_SECRET_KEY/JWT_SECRET_KEY.
    CRON_SECRET: str | None = None
    # Independent of CRON_SECRET being set: this is the actual "do real work"
    # switch. Lets the cron wiring + auth be deployed and verified (ticks
    # land in market_scan_logs as 0-company no-ops) before flipping this on.
    MARKET_SCAN_ENABLED: bool = False
    # Companies processed per tick. Tuned against Vercel's maxDuration=60s
    # (apps/api/vercel.json) — keep conservative; raising this trades tick
    # latency for scan throughput, sanity-check against real tick
    # duration_ms in market_scan_logs before increasing.
    MARKET_SCAN_BATCH_SIZE: int = 20
    # Minimum time between two scans of the same company.
    MARKET_SCAN_INTERVAL_HOURS: int = 24

    # ----- Durable job queue (opt-in) -------------------------------------------
    # See app.services.job_queue and app.services.external_api.worker.
    # IngestionWorker's asyncio.Queue lives entirely in one process's memory —
    # on a serverless deployment (Vercel — see DEPLOY_CHECKLIST.md) a queued
    # task can vanish the moment that function instance suspends, since there
    # is no persistent process for a queue to live in. "redis" switches
    # IngestionWorker.enqueue() to push onto a Redis-backed durable queue
    # instead (requires REDIS_URL — see app.core.redis), drained by a Vercel
    # Cron Job hitting GET /internal/jobs/tick, the same
    # enqueue-durably/drain-on-a-cron-tick shape already proven by
    # MarketScanOrchestrator. "in_process" (the default) is today's
    # behavior, completely unchanged.
    JOB_QUEUE_BACKEND: Literal["in_process", "redis"] = "in_process"
    # Envelopes drained per cron tick. Same maxDuration=60s conservatism as
    # MARKET_SCAN_BATCH_SIZE — each envelope runs the same processing
    # IngestionWorker's own loop already does per task.
    JOB_QUEUE_TICK_BATCH_SIZE: int = 20

    # ----- AccountResearchAgent (deep per-account research, opt-in) -------------
    # See app.services.account_research. Distinct from MarketScanOrchestrator
    # above: that pipeline is cheap, per-tick, and eager (runs on every due
    # company on a schedule); this one is expensive (up to 4 provider calls
    # + an LLM synthesis) and explicitly on-demand only — never fired by a
    # bulk import, never fired by MarketScanOrchestrator's own tick. See
    # that service's module docstring for the trigger points.
    ACCOUNT_RESEARCH_ENABLED: bool = False
    # A cached AccountBrief younger than this is returned as-is — the
    # research pass itself does not re-run. This is the "strict cache" the
    # cost-protection design calls for: at most one real research pass per
    # company per this many days, full stop, regardless of how many times
    # a trigger condition fires in between.
    ACCOUNT_RESEARCH_TTL_DAYS: int = 30
    # Hard ceiling on new AccountBrief rows one organization can produce in
    # a rolling 24h window. Protects the shared provider rate limits (see
    # rate_limiter.py) and API cost from a burst of trigger events — e.g. a
    # CSV import that assigns owners to 100 companies at once. Hitting the
    # cap postpones the research (never fails the action that triggered
    # it) and is visible in the response, never a silent drop.
    ACCOUNT_RESEARCH_DAILY_BUDGET_PER_ORG: int = 20

    # ----- Federated Signal Intelligence ----------------------------------------
    # See app.services.federated_intelligence. The k-anonymity floor: a
    # cross-tenant prior is only ever returned once at least this many
    # DISTINCT organizations have contributed to a (signal_type, industry)
    # bucket — below it, get_prior() returns None rather than a statistic
    # traceable to too few orgs. The module-level default (3) is deliberately
    # low for an early pilot cohort so the feature is observable at all
    # before dozens of organizations have opted in; raise this — e.g. to 15-20
    # — once the fleet is large enough that a higher floor still clears
    # routinely, trading a slower cold start for a stronger anonymity
    # guarantee. Never lower it below 2: at 1 the "aggregate" is just one
    # org's own history relabeled.
    FEDERATED_INTELLIGENCE_MIN_CONTRIBUTING_ORGS: int = Field(default=3, ge=2)

    # ----- WorkflowOrchestrator webhooks (all opt-in) ---------------------------
    # Set any of these to activate the corresponding workflow handler.
    # Leave unset (None) to run in mock mode (full audit trail, no real calls).
    WORKFLOW_CRM_URL: str | None = None
    WORKFLOW_DELIVERY_URL: str | None = None
    WORKFLOW_BILLING_URL: str | None = None
    WORKFLOW_NOTIFY_URL: str | None = None

    # ----- OmnichannelGateway — channel credentials (all opt-in) ---------------
    # LinkedIn (REST API v2)
    LINKEDIN_ACCESS_TOKEN: str | None = None
    # X / Twitter (API v2)
    TWITTER_BEARER_TOKEN: str | None = None
    TWITTER_API_KEY: str | None = None
    # Email (SMTP)
    EMAIL_SMTP_HOST: str | None = None
    EMAIL_SMTP_PORT: int = 587
    EMAIL_SMTP_USER: str | None = None
    EMAIL_SMTP_PASSWORD: str | None = None
    EMAIL_FROM_ADDRESS: str | None = None

    # ----- AI providers -------------------------------------------------------
    # AI_PROVIDER controls which LLM is used for strategy + artifact generation.
    # When "none", BEE falls back to rule-based generators (zero cost, instant).
    AI_PROVIDER: Literal["openai", "anthropic", "none"] = "none"
    AI_API_KEY: str | None = None
    AI_MODEL: str = "gpt-4o-mini"
    # Anthropic-specific model (used when AI_PROVIDER=anthropic)
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"
    # LLM generation timeouts (seconds)
    AI_TIMEOUT_SECONDS: int = 30
    AI_MAX_RETRIES: int = 2

    # ----- VectorKnowledgeBase (Sales DNA) ------------------------------------
    # VECTOR_STORE_BACKEND controls persistence of the Sales DNA memory:
    #   pgvector — persistent, semantic, production-grade (default — requires
    #              the pgvector extension; see DEPLOY_CHECKLIST.md §3).
    #   mock     — in-memory TF-IDF; resets on restart, zero deps. Set this
    #              explicitly for local dev without a pgvector-enabled
    #              Postgres, or CI. Every service that reads from the store
    #              already treats a query failure as "no results" rather
    #              than propagating (see e.g.
    #              StrategyGeneratorService._query_similar_wins's own
    #              docstring: "Non-blocking: returns [] when the store is
    #              empty or unavailable") — so if pgvector construction or a
    #              query fails for any reason (missing extension,
    #              unreachable DB), the *application* degrades gracefully.
    #              What it does NOT do on its own is tell you it happened —
    #              see get_vector_store_status()/GET /api/v1/status, which
    #              exists specifically because that silent-degradation gap
    #              was flagged as a real production risk: this setting can
    #              say "pgvector" while the store actually in use is Mock.
    VECTOR_STORE_BACKEND: Literal["mock", "pgvector"] = "pgvector"

    # Embedding model for pgvector (used when VECTOR_STORE_BACKEND=pgvector).
    # text-embedding-3-small: 1536 dims, ~$0.02/1M tokens (recommended)
    # text-embedding-3-large: 3072 dims, higher quality, higher cost
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    # Embedding dimension must match the model above.
    EMBEDDING_DIMENSIONS: int = 1536

    # ----- External Ingestion Layer -------------------------------------------
    EXTERNAL_INGESTION_ENABLED: bool = True
    EXTERNAL_WORKER_QUEUE_SIZE: int = 1000

    # LinkedIn Sales Navigator / REST API (profile enrichment)
    LINKEDIN_CLIENT_ID: str | None = None
    LINKEDIN_CLIENT_SECRET: str | None = None
    LINKEDIN_WEBHOOK_SECRET: str | None = None

    # G2 intent signals
    G2_API_KEY: str | None = None
    G2_WEBHOOK_SECRET: str | None = None

    # Google Custom Search (company research)
    GOOGLE_SEARCH_API_KEY: str | None = None
    GOOGLE_SEARCH_CX: str | None = None
    GOOGLE_WEBHOOK_SECRET: str | None = None

    # Capterra (future)
    CAPTERRA_API_KEY: str | None = None
    CAPTERRA_WEBHOOK_SECRET: str | None = None

    # Outbound email delivery providers — BEE never calls these APIs, only
    # verifies their inbound event webhooks (open/click/reply/bounce),
    # which POST /api/v1/webhooks/receive turns into DarkFunnelSignal rows.
    # No API key here: sending itself still goes through Gmail OAuth
    # (gmail.send) or the configured ExecutiveAgent webhook, not these.
    #
    # These secrets sign BEE's own HMAC scheme (same X-BEE-Signature /
    # X-Provider-Signature header as every other provider in this file),
    # NOT SendGrid's native ECDSA event-webhook signing or Resend's native
    # Svix headers — a real production wire-up needs a small adapter in
    # front of this endpoint that verifies the provider's own signature and
    # re-signs with this secret before forwarding, same shape as
    # HiringProvider limiting itself to one real ATS integration instead of
    # three partial ones. See POST /webhooks/receive's docstring.
    SENDGRID_WEBHOOK_SECRET: str | None = None
    RESEND_WEBHOOK_SECRET: str | None = None

    @property
    def sqlalchemy_database_uri(self) -> str:
        """Return a usable SQLAlchemy connection string.

        Prefers an explicit ``DATABASE_URL`` (as provided by most managed
        Postgres hosts) and falls back to assembling one from the discrete
        ``POSTGRES_*`` components. This keeps deployment flexible without
        leaking any credential handling into the rest of the app.
        """
        if self.DATABASE_URL:
            # Normalize the legacy ``postgres://`` scheme to the driver SQLAlchemy
            # expects. Managed providers frequently emit the former.
            uri = str(self.DATABASE_URL)
            return uri.replace("postgres://", "postgresql+psycopg://", 1).replace(
                "postgresql://", "postgresql+psycopg://", 1
            )
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins(self) -> list[str]:
        """Parse the comma-separated CORS origins into a list.

        Trailing slashes are stripped from each origin. Starlette's
        ``CORSMiddleware`` does an *exact* string match against the
        browser's ``Origin`` header, which per spec never has a trailing
        slash (``https://example.com``, not ``https://example.com/``) — a
        value copy-pasted from a browser's address bar or a "visit site"
        link commonly does have one, and without this normalization that
        one extra character silently breaks every cross-origin request
        with no server-side log line at all, surfacing only as a
        browser-console CORS error nobody's watching in production. Cheap
        to always do; there's no legitimate origin that both wants CORS
        and wants a trailing slash preserved.
        """
        return [
            origin.strip().rstrip("/")
            for origin in self.BACKEND_CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    @model_validator(mode="after")
    def _warn_on_production_hardening_gaps(self) -> Settings:
        """Loudly flag dev-only settings left in place in production.

        ``WEBHOOK_SIGNATURE_REQUIRED`` now defaults to ``True`` and
        ``WEBHOOK_SIGNING_SECRET`` to a fresh random value per process start
        (see their field definitions above), so the common failure mode —
        nobody configuring either one — is closed by default rather than
        silently accepting unsigned webhooks. This check exists for the
        remaining way to end up insecure: someone *explicitly* setting
        ``WEBHOOK_SIGNATURE_REQUIRED=false``, or copy-pasting the
        ``.env.example`` placeholder secrets (``change-me-in-production``)
        into a real production environment.

        This logs a ``CRITICAL`` line rather than raising: a hard startup
        failure here is only safe once we know every real deployment already
        sets these correctly, which we can't confirm from the repo alone.
        Until then, a loud, unmissable log line beats a silent gap — flip
        this to raise once existing deployments are confirmed compliant.
        """
        if self.ENVIRONMENT != "production":
            return self

        problems: list[str] = []
        if not self.WEBHOOK_SIGNATURE_REQUIRED:
            problems.append("WEBHOOK_SIGNATURE_REQUIRED must be true in production")
        if self.WEBHOOK_SIGNING_SECRET == "change-me-in-production":
            problems.append("WEBHOOK_SIGNING_SECRET is still the default placeholder value")
        if self.JWT_SECRET_KEY == "change-me-in-production":
            problems.append("JWT_SECRET_KEY is still the default placeholder value")
        if (
            self.GOOGLE_OAUTH_CLIENT_ID
            or self.GOOGLE_OAUTH_CLIENT_SECRET
            or self.LINKEDIN_OAUTH_CLIENT_ID
            or self.LINKEDIN_OAUTH_CLIENT_SECRET
            or self.SALESFORCE_OAUTH_CLIENT_ID
            or self.SALESFORCE_OAUTH_CLIENT_SECRET
            or self.HUBSPOT_OAUTH_CLIENT_ID
            or self.HUBSPOT_OAUTH_CLIENT_SECRET
            or self.JIRA_OAUTH_CLIENT_ID
            or self.JIRA_OAUTH_CLIENT_SECRET
        ) and not self.TOKEN_ENCRYPTION_KEY:
            problems.append(
                "A *_OAUTH_CLIENT_ID/SECRET pair is set but TOKEN_ENCRYPTION_KEY is not — "
                "connected integration tokens would fail to store"
            )
        # sqlalchemy_database_uri never raises or returns None when the DB
        # isn't configured — it silently assembles a connection string from
        # the POSTGRES_* defaults (localhost/bee/bee), which only fails once
        # the first real request hits Postgres, as a confusing "connection
        # refused" deep inside a request instead of a clear config error at
        # boot. Neither DATABASE_URL set nor POSTGRES_HOST/PASSWORD changed
        # from their local-dev defaults means nobody configured a real DB.
        if not self.DATABASE_URL and self.POSTGRES_HOST == "localhost" and self.POSTGRES_PASSWORD == "bee":
            problems.append(
                "DATABASE_URL is unset and POSTGRES_* still hold their local-dev "
                "defaults (host=localhost, password=bee) — set DATABASE_URL or "
                "the real POSTGRES_* values"
            )
        # BACKEND_CORS_ORIGINS left at its localhost-only dev default means
        # the real production frontend origin is silently rejected by CORS —
        # not a security hole, but it fails as a confusing browser-side
        # "Failed to fetch"/CORS console error with nothing logged
        # server-side, exactly the kind of gap this check exists to surface
        # at boot instead of in a support ticket.
        if self.BACKEND_CORS_ORIGINS == "http://localhost:3000":
            problems.append(
                "BACKEND_CORS_ORIGINS is still the localhost-only dev default — "
                "the real production frontend origin will be rejected by CORS"
            )
        # A trailing slash on a configured origin used to silently break CORS
        # entirely (see cors_origins' docstring — now auto-stripped there),
        # but still flag it here: whoever set the value should fix it at the
        # source rather than rely on the runtime normalization forever.
        if any(origin.strip().endswith("/") for origin in self.BACKEND_CORS_ORIGINS.split(",")):
            problems.append(
                "BACKEND_CORS_ORIGINS has an origin with a trailing slash "
                f"({self.BACKEND_CORS_ORIGINS!r}) — browsers never send a trailing "
                "slash in the Origin header, so this is auto-corrected at runtime, "
                "but fix the stored value so it isn't relying on that"
            )
        # VECTOR_STORE_BACKEND=mock means Sales DNA / brand voice semantic
        # search runs on a non-persistent, in-memory TF-IDF store that
        # resets on every restart — a real feature quietly degrading, not
        # fake data returned to a request, but still worth catching at boot
        # rather than discovering it after every deploy resets the store.
        # This only catches the *configured* value being wrong — it can't
        # see a "pgvector" that silently fell back to Mock at runtime (a
        # missing extension, an unreachable DB); GET /api/v1/status reports
        # the backend actually in use for that, see get_vector_store_status().
        if self.VECTOR_STORE_BACKEND == "mock":
            problems.append(
                "VECTOR_STORE_BACKEND is set to \"mock\" — Sales DNA/brand-voice "
                "search will silently reset on every restart instead of persisting"
            )

        if problems:
            logging.getLogger(__name__).critical(
                "INSECURE PRODUCTION CONFIG — %s. Webhooks/sessions are not properly "
                "authenticated until this is fixed.",
                "; ".join(problems),
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance.

    Caching guarantees a single, consistent configuration object across the
    process and avoids re-parsing the environment on every request.
    """
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
