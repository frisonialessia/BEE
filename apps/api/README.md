# BEE API — Sales Force Intelligence backend

FastAPI + SQLModel + PostgreSQL. A modular, SOLID backend whose centerpiece is
the **Signal Engine**: it ingests market signals via webhook, classifies and
scores them through pluggable analyzers, and turns them into actionable
sales opportunities.

## Architecture (clean, layered)

```
app/
├── core/            Infrastructure: config, database, security, logging
│   ├── config.py        Typed settings loaded from .env (never hard-code secrets)
│   ├── database.py      SQLModel engine + session dependency
│   ├── security.py      HMAC webhook signature verification
│   └── logging.py       Structured logging setup
├── models/          SQLModel entities (the DB schema)
│   ├── company.py       Company
│   ├── lead.py          Lead
│   ├── signal.py        Signal (trigger)
│   └── opportunity.py   Opportunity (lead + signal + strategy)
├── schemas/         Pydantic DTOs — the external API contract
├── repositories/    Repository pattern — encapsulated data access
├── services/
│   └── signal_engine/   The Signal Engine
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
  interface, so `LLMAnalyzer` drops in interchangeably with the rule-based ones.
- **Security** — all secrets come from the environment; webhooks are
  authenticated with HMAC-SHA256 signatures.

### The AI-powered analyzer

`app/services/signal_engine/analyzers/llm_analyzer.py` registers `LLMAnalyzer`
(`priority=200`) alongside the keyword analyzers. It's active whenever
`AI_PROVIDER` (`openai`/`anthropic`) and `AI_API_KEY` are set; otherwise
`supports()` returns `False` and the engine falls back to the keyword
analyzers exactly as before. It asks the configured LLM to classify the raw
payload (`signal_type`, `score`, `confidence`, `tags`, and optionally a
`strategy` seed) — the SignalEngine runs every analyzer that supports the
payload and keeps whichever result scores highest, so the LLM classification
competes with, never replaces, the keyword ones.

Adding a further analyzer follows the same shape:

```python
from app.services.signal_engine.analyzers.base import AnalysisResult, SignalAnalyzer
from app.services.signal_engine.analyzers.registry import register_analyzer

@register_analyzer
class MyAnalyzer(SignalAnalyzer):
    name = "my_analyzer"
    priority = 150

    def supports(self, payload) -> bool:
        return True  # decide when this analyzer should run

    def analyze(self, payload) -> AnalysisResult:
        # inspect payload and return a classification, optionally with a
        # strategy seed in AnalysisResult.strategy
        ...
```

That is the *entire* integration surface — the engine, endpoints, and DB stay
untouched.

### Billing (Stripe) — built, not connected

`app/services/billing/` + `app/api/v1/endpoints/billing.py` already implement
Stripe Checkout, the Customer Portal, and a signature-verified webhook
(`Organization.stripe_customer_id`/`stripe_subscription_id`/
`stripe_subscription_status`). **Deliberately not enforcing anything yet** —
no plan/feature is gated on subscription status, and there's no frontend UI
to start a checkout. This is intentionally deprioritized for the MVP; "wire
it into a real pricing page" is a follow-up, not a blocker. To turn it on
when that's ready: set `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` (see
`.env.example`) and register the webhook endpoint in the Stripe dashboard —
the backend needs nothing further.

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
pytest            # 480+ tests, hermetic (in-memory SQLite, no Postgres needed)
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

A customer integration never holds that server-wide secret, so the endpoint
also accepts an **organization API key** as the credential on its own:

```
X-BEE-Org-Key: bee_org_...
```

Keys are minted per organization from the dashboard (Integrations → Señales
entrantes / Reportes y BI) or via `POST /api/v1/organizations/api-keys`. A
request carrying a valid key is both authenticated *and* scoped to that
organization; a presented-but-invalid `X-BEE-Signature` is still rejected
even alongside a valid key. Requests with neither credential are rejected
whenever signature enforcement is on.

## Multi-tenant auth (Organization / Team / User)

Distinct from the `X-API-Key`/HMAC auth above — those gate *service-to-service*
calls (the frontend, integrations) with a shared secret. This is per-*human*
session auth for the dashboard, with role-based visibility:

* **Organization** — the tenant boundary. Created once, via `POST /auth/register`,
  which also creates its first user as `OWNER`. There is no self-serve "join an
  existing org" flow — every other teammate is added by an OWNER/ADMIN via
  `POST /users`.
* **Team** — a node in the manager hierarchy (`parent_team_id`, self-referential).
* **User** — belongs to one Organization and (optionally) one Team, with a role:

  | Role | Sees |
  |------|------|
  | `OWNER` / `ADMIN` | Everything in the organization |
  | `MANAGER` | Their own assignments + everyone in their team or any descendant team |
  | `MEMBER` | Only records assigned to themselves |

```bash
curl -X POST localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"organization_name":"Acme","full_name":"Alice","email":"alice@acme.com","password":"..."}'
# → {"access_token": "...", "user": {...}}

curl localhost:8000/api/v1/opportunities -H 'Authorization: Bearer <access_token>'
# → only opportunities this user can see, per the table above
```

Sessions are stateless JWTs (`JWT_SECRET_KEY`, 7-day default expiry) — no
server-side session store, so this scales horizontally without sticky
sessions. A request with no `Authorization` header behaves exactly as before
this system existed (unrestricted, API-key-gated) — the retrofit onto
`GET /opportunities` is additive, not a breaking change for existing
integrations. See `app/services/permissions/service.py` for the visibility
rule and `app/api/deps.py` for `get_current_user`/`require_roles`.

## Migrations

Schema changes are versioned with Alembic:

```bash
alembic revision --autogenerate -m "add table"
alembic upgrade head        # or: make api-migrate
```

For local/staging dev, `init_db()` auto-creates tables on startup as a
convenience. In production (`ENVIRONMENT=production`), `init_db()` is skipped
entirely — schema there is Alembic-only, so a missing migration fails loudly
instead of being silently papered over by `create_all()`.
