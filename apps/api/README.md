# BEE API — Sales Force Intelligence backend

FastAPI + SQLModel + PostgreSQL. A modular, SOLID backend whose centerpiece is
the **Signal Engine (Motor de Señales)**: it ingests market signals via webhook,
classifies and scores them through pluggable analyzers, and turns them into
actionable sales opportunities.

## Architecture (clean, layered)

```
app/
├── core/            Infrastructure: config, database, security, logging
│   ├── config.py        Typed settings loaded from .env (never hard-code secrets)
│   ├── database.py      SQLModel engine + session dependency
│   ├── security.py      HMAC webhook signature verification
│   └── logging.py       Structured logging setup
├── models/          SQLModel entities (the DB schema)
│   ├── company.py       Empresa
│   ├── lead.py          Lead
│   ├── signal.py        Señal (trigger)
│   └── opportunity.py   Oportunidad (lead + signal + strategy)
├── schemas/         Pydantic DTOs — the external API contract
├── repositories/    Repository pattern — encapsulated data access
├── services/
│   └── signal_engine/   The Motor de Señales
│       ├── engine.py            Orchestration
│       └── analyzers/           ← THE EXTENSION POINT
│           ├── base.py              SignalAnalyzer ABC + AnalysisResult
│           ├── registry.py          Plugin registry (@register_analyzer)
│           └── keyword_analyzers.py Built-in rule-based analyzers
└── api/             Thin HTTP transport layer (FastAPI routers)
    └── v1/endpoints/
        ├── signals.py   POST /signals/webhook  (Motor de Señales)
        └── health.py    /health, /ready
```

Each layer depends only on the one below it through abstractions
(Dependency Inversion). The transport, business, and persistence concerns are
fully separated, keeping the domain logic independently testable.

## SOLID & extensibility highlights

- **Open/Closed** — add new intelligence by writing an analyzer and decorating it
  with `@register_analyzer`. **No existing code changes.**
- **Single Responsibility** — config, security, persistence, and each analyzer
  each own exactly one concern.
- **Liskov Substitution** — the engine treats every analyzer through one
  interface, so a future `LLMAnalyzer` drops in interchangeably with the
  rule-based ones.
- **Security** — all secrets come from the environment; webhooks are
  authenticated with HMAC-SHA256 signatures.

### Adding an AI-powered analyzer later

```python
from app.services.signal_engine.analyzers.base import AnalysisResult, SignalAnalyzer
from app.services.signal_engine.analyzers.registry import register_analyzer

@register_analyzer
class LLMAnalyzer(SignalAnalyzer):
    name = "llm"
    priority = 200  # run before rule-based analyzers

    def supports(self, payload) -> bool:
        return True  # let the model look at everything

    def analyze(self, payload) -> AnalysisResult:
        # call your LLM (settings.AI_API_KEY / settings.AI_MODEL) and return a
        # rich, generated strategy in AnalysisResult.strategy
        ...
```

That is the *entire* integration surface — the engine, endpoints, and DB stay
untouched.

## Quickstart

```bash
cd apps/api
cp .env.example .env               # fill in real values

# with uv (recommended)
uv venv .venv && source .venv/bin/activate
uv pip install -r requirements-dev.txt

# or with pip
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# run the API (needs a reachable PostgreSQL; see docker compose at repo root)
uvicorn app.main:app --reload
```

Interactive docs: <http://localhost:8000/docs>

### Run with Docker (Postgres + API)

```bash
# from the repo root
docker compose up --build
```

### Tests & quality

```bash
pytest            # 11 tests, hermetic (in-memory SQLite, no Postgres needed)
ruff check app tests
mypy app
```

## The webhook (Motor de Señales)

`POST /api/v1/signals/webhook`

```json
{
  "title": "Acme Corp raised a $20M Series B",
  "event": "funding.round.announced",
  "external_id": "provider:evt_123",
  "company": { "name": "Acme Corp", "domain": "acme.com" },
  "lead": { "full_name": "Jane Doe", "email": "jane@acme.com", "title": "VP Sales" },
  "data": { "amount_usd": 20000000, "round": "series_b" }
}
```

Response (`201 Created`) contains the persisted signal, the generated opportunity
(when a strategy applies), and the list of analyzers that fired.

### Webhook security

Requests are authenticated with an HMAC-SHA256 signature in the `X-BEE-Signature`
header, computed over the raw body with `WEBHOOK_SIGNING_SECRET`:

```
X-BEE-Signature: sha256=<hex digest>
```

Signature enforcement is controlled by `WEBHOOK_SIGNATURE_REQUIRED` (off locally,
**on in production**).

## Migrations

Schema changes are versioned with Alembic:

```bash
alembic revision --autogenerate -m "add table"
alembic upgrade head
```

For local dev, `init_db()` auto-creates tables on startup as a convenience.
