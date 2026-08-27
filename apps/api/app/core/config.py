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
    API_KEY_EXEMPT_PATHS: str = "/api/v1/health,/api/v1/ready,/api/v1/webhooks/receive,/api/v1/contact"

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

    # ----- CORS ----------------------------------------------------------------
    # Comma-separated list of origins allowed to call the API (the Next.js app).
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000"

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
    #   mock    — in-memory TF-IDF (default; resets on restart; zero deps)
    #   pgvector — persistent, semantic, production-grade (requires pgvector ext)
    VECTOR_STORE_BACKEND: Literal["mock", "pgvector"] = "mock"

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
        """Parse the comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

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
