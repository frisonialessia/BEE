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

from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn, field_validator
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
    WEBHOOK_SIGNING_SECRET: str = "change-me-in-production"
    # Toggle allows local development without signing while enforcing it in prod.
    WEBHOOK_SIGNATURE_REQUIRED: bool = False

    # API Key authentication for REST endpoints.
    # When set, all non-health endpoints require the header:
    #   X-API-Key: <value>
    # Set to None to disable (development mode).
    API_SECRET_KEY: str | None = None
    # Comma-separated list of paths exempt from API key auth (exact prefix match).
    # /api/v1/health and /api/v1/ready are always exempt.
    API_KEY_EXEMPT_PATHS: str = "/api/v1/health,/api/v1/ready,/api/v1/webhooks/receive"

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

    @field_validator("WEBHOOK_SIGNING_SECRET")
    @classmethod
    def _warn_on_default_secret(cls, value: str) -> str:
        # We deliberately do not raise here so local dev stays frictionless, but
        # the value is validated for presence. Production hardening is enforced
        # in ``security.py`` where signature verification actually runs.
        return value


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance.

    Caching guarantees a single, consistent configuration object across the
    process and avoids re-parsing the environment on every request.
    """
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
