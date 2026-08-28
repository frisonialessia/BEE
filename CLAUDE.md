# CLAUDE.md

Guidance for Claude Code (and any other AI agent) working in this repository.

## Project overview

BEE is a sales-intelligence platform: it ingests market signals (funding
rounds, key hires, tech-stack changes, intent data) via webhook, scores them
through pluggable analyzers, and turns qualified triggers into prioritized,
actionable opportunities with an AI-generated sales strategy attached.

## Monorepo layout

```
apps/
├── api/    FastAPI + SQLModel + PostgreSQL backend
└── web/    Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
```

The two apps are independently deployable and communicate only over a
versioned HTTP API (`NEXT_PUBLIC_API_URL` on the frontend). They deploy as
**two separate projects** — do not merge them into a single deployment
target. See `DEPLOY_CHECKLIST.md` at the repo root for the full production
deployment guide.

Each app also has its own `README.md` with architecture detail:
`apps/api/README.md` and `apps/web/README.md`. `apps/web/AGENTS.md` has
framework-specific notes for that app.

## Commands

**Backend** (`apps/api/`):
```bash
cp .env.example .env               # fill in real values, never commit .env
uv venv .venv && source .venv/bin/activate
uv pip install -r requirements-dev.txt
pytest                             # hermetic — in-memory SQLite, no Postgres needed
ruff check app tests
mypy app
uvicorn app.main:app --reload      # http://localhost:8000/docs
alembic upgrade head               # apply migrations
```

**Frontend** (`apps/web/`):
```bash
cp .env.example .env.local
pnpm install
pnpm dev                           # http://localhost:3000
pnpm lint
pnpm build
```

**Both at once**: `docker compose up --build` from the repo root (Postgres + API), then run the frontend separately as above.

## Security — read before touching config or secrets

- **Never commit real secrets.** Every `.env` is git-ignored; only
  `.env.example` (placeholder values, never real ones) is tracked. If you
  need to document a new required variable, add it to the relevant
  `.env.example` with a `change-me`-style placeholder, not a working value.
- Generate secrets with `python -c "import secrets; print(secrets.token_hex(32))"`
  and hand them to the deployment platform's environment-variable store
  (Vercel, etc.) directly — never through a file that gets committed.
- `JWT_SECRET_KEY` refuses to start the app in `ENVIRONMENT=production` if
  left at its default placeholder — this is intentional, do not work around it.
- The internal support tool (`POST /api/v1/internal/support/reset-password`,
  gated by `SUPPORT_ADMIN_SECRET`) is an emergency-only, BEE-team-only
  action. Never expose it, log its secret, or widen it into a general
  cross-tenant admin role — see its module docstring for the full rationale.
- This project is multi-tenant. Any new endpoint or query touching
  organization-scoped data must go through
  `app/services/permissions/service.py`'s scoping helpers — never write a
  raw query that skips `organization_id` filtering.

## Conventions

- Backend: layered architecture (`api/` → `services/` → `repositories/` →
  `models/`), SOLID, dependency inversion — see `apps/api/README.md` for the
  extension-point pattern (`@register_analyzer`) used throughout.
- Frontend: domain types live in `apps/web/src/types/domain.ts`, mirrored
  from `apps/api/app/schemas/`. Keep them in sync when either side changes.
- Tests are hermetic (in-memory SQLite for the backend) — no external
  services required to run the suite. Run the full suite before pushing;
  most of this codebase's regressions have been caught this way.
- Commit messages and PR descriptions: be specific about *why*, not just
  *what* — this codebase's history is written that way and it's the fastest
  way for the next person (human or agent) to understand a change.
