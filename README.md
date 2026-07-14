# 🐝 BEE — Sales Force Intelligence

> A living system that **detects** and **executes** sales opportunities from
> real-time market signals. Modular, efficient, and market-aware by design.

BEE watches the market for the moments that matter — a funding round, a key
hire, a new tool in the stack — scores them, and turns each qualified trigger
into an actionable, prioritized opportunity (lead + signal + strategy), ready for
an AI layer to generate the play.

---

## 1. Architecture — decoupled & scalable

A **monorepo** with independently deployable apps. This keeps the frontend and
backend loosely coupled (they communicate only over a versioned HTTP API) while
sharing a single source of truth for tooling, docs, and CI.

```
bee/
├── apps/
│   ├── api/                     FastAPI + SQLModel + PostgreSQL backend
│   │   ├── app/
│   │   │   ├── core/            config · database · security · logging
│   │   │   ├── models/          SQLModel entities (the DB schema)
│   │   │   ├── schemas/         Pydantic DTOs (external API contract)
│   │   │   ├── repositories/    Repository pattern (data access)
│   │   │   ├── services/
│   │   │   │   └── signal_engine/   ← Motor de Señales
│   │   │   │       ├── engine.py         orchestration
│   │   │   │       └── analyzers/        ← THE EXTENSION POINT (plugins)
│   │   │   └── api/v1/          thin HTTP routers
│   │   ├── alembic/            database migrations
│   │   ├── tests/              hermetic tests (SQLite, no Postgres needed)
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── web/                     Next.js (App Router) + TS + Tailwind + shadcn/ui
│       └── src/
│           ├── app/            / (landing) · /dashboard (intelligence)
│           ├── components/     UI + shadcn primitives
│           └── lib/            API client · types · formatting
│
├── docker-compose.yml           Postgres + API for local dev
└── README.md
```

**Why this layout deploys cleanly**

- `apps/web` → Vercel (or any Node host). Points at the API via
  `NEXT_PUBLIC_API_URL`.
- `apps/api` → any container platform (Fly, Railway, Render, ECS…) using the
  provided `Dockerfile`. Scales horizontally and is ready for async workers.
- `docker-compose.yml` runs the whole stack locally with one command.

### Clean, layered dependencies

```
HTTP (api/) → Services (signal_engine/) → Repositories → Models → PostgreSQL
                     ↑
               Analyzers (plugins)
```

Each layer depends only on abstractions from the layer below (Dependency
Inversion), so any piece can be tested or replaced in isolation.

---

## 2. Database schema

Four core entities. **An Opportunity is the heart of BEE**: it connects a
`Lead` + a `Signal` + a `strategy`.

```mermaid
erDiagram
    COMPANY ||--o{ LEAD : employs
    COMPANY ||--o{ SIGNAL : "is subject of"
    COMPANY ||--o{ OPPORTUNITY : targets
    LEAD    ||--o{ SIGNAL : "is subject of"
    LEAD    ||--o{ OPPORTUNITY : "is target of"
    SIGNAL  ||--o{ OPPORTUNITY : triggers

    COMPANY {
        uuid id PK
        string name
        string domain "unique · natural key"
        string industry
        string country
        json   attributes "enrichment"
    }
    LEAD {
        uuid   id PK
        uuid   company_id FK
        string full_name
        string email "dedup key"
        string title
        string seniority
        enum   status
        float  score
    }
    SIGNAL {
        uuid   id PK
        uuid   company_id FK "nullable"
        uuid   lead_id FK "nullable"
        enum   signal_type
        enum   source
        string title
        string external_id "idempotency"
        float  score
        float  confidence
        datetime detected_at
        json   raw_payload "preserved for reprocessing"
        json   analysis "analyzer output"
    }
    OPPORTUNITY {
        uuid   id PK
        uuid   signal_id FK
        uuid   lead_id FK
        uuid   company_id FK
        string title
        enum   status
        float  score
        json   strategy "AI-ready playbook"
    }
```

Design choices that make it future-proof:

- **UUID primary keys** — non-guessable, generatable across shards/integrations.
- **JSON columns** (`attributes`, `raw_payload`, `analysis`, `strategy`) — the
  schema stays stable while integrations and the AI layer evolve. Original
  payloads are never lost, so historical signals can be re-analyzed.
- **Nullable FKs on Signal** — ingestion is never blocked by incomplete entity
  data; resolution can be enriched asynchronously.
- **`external_id`** — idempotent ingestion / dedup for retrying webhooks.

---

## 3. The Signal Engine (Motor de Señales)

`POST /api/v1/signals/webhook`

An HMAC-authenticated webhook that:

1. verifies the sender's signature,
2. validates the JSON envelope,
3. resolves the company & lead (get-or-create),
4. runs **every applicable analyzer** and aggregates their verdicts,
5. persists the `Signal`,
6. materializes an `Opportunity` when an analyzer proposes a strategy.

### Extensible by design (the key requirement)

Adding a new kind of intelligence = writing one class and decorating it. **No
changes to the engine, endpoints, or database.**

```python
from app.services.signal_engine.analyzers.base import AnalysisResult, SignalAnalyzer
from app.services.signal_engine.analyzers.registry import register_analyzer

@register_analyzer
class LLMAnalyzer(SignalAnalyzer):
    name = "llm"
    priority = 200  # runs before the rule-based analyzers

    def supports(self, payload) -> bool:
        return True

    def analyze(self, payload) -> AnalysisResult:
        # call your model (settings.AI_API_KEY / settings.AI_MODEL),
        # then return a rich, generated strategy
        ...
```

This is exactly how the **AI layer** plugs in later — the architecture is ready
for it now.

---

## 4. Security

- **No secrets in code.** All configuration comes from the environment via typed
  `pydantic-settings`. `.env` is git-ignored; `.env.example` documents the
  contract.
- **Signed webhooks.** Inbound requests carry an HMAC-SHA256 signature
  (`X-BEE-Signature`) verified against `WEBHOOK_SIGNING_SECRET`. Enforcement is
  toggled on for production.
- **Least privilege.** The API container runs as a non-root user.

---

## 5. Quickstart

### Everything at once (recommended)

```bash
docker compose up --build        # Postgres + API
# → API:  http://localhost:8000/docs
```

```bash
cd apps/web
cp .env.example .env.local
pnpm install && pnpm dev         # → http://localhost:3000
```

### Backend only (with tests)

```bash
cd apps/api
cp .env.example .env
uv venv .venv && source .venv/bin/activate   # or python -m venv
uv pip install -r requirements-dev.txt
pytest                                        # 11 tests, hermetic
uvicorn app.main:app --reload
```

### Try the engine

```bash
curl -X POST http://localhost:8000/api/v1/signals/webhook \
  -H "content-type: application/json" \
  -d '{
    "title": "Acme raised a $20M Series B",
    "event": "funding.round.announced",
    "external_id": "provider:evt_123",
    "company": {"name": "Acme", "domain": "acme.com"},
    "lead": {"full_name": "Jane Doe", "email": "jane@acme.com", "title": "VP Sales"}
  }'
```

---

## 6. Tech stack

| Layer     | Technology                                        |
| --------- | ------------------------------------------------- |
| Frontend  | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend   | Python, FastAPI, SQLModel, Pydantic               |
| Database  | PostgreSQL (Alembic migrations)                   |
| Infra     | Docker / docker-compose                           |

Built on **SOLID** principles, ready to grow into a full market-intelligence
platform.
