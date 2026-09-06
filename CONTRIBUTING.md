# Contributing to BEE

BEE is MIT licensed and the invitation is real: clone it, change it, ship
your own. If you'd rather send something back here, this is what makes that
easy.

One person maintains this, so the honest expectation is: I read everything,
I reply, and I merge what fits. I may take days. A PR that fixes something
specific is more likely to land than one that reorganizes things.

## Before you write code

**Open an issue first for anything larger than a fix.** Not ceremony — it's
so you don't spend a weekend on something I've already decided against, or
that's already half-built in a branch. For a typo, a bug, or a test, skip
straight to the PR.

**Read `CLAUDE.md` first.** It's written for AI agents but it's the actual
house rules: the layering, the multi-tenancy requirement, what never gets
committed. It's shorter than this file.

## Running it

```bash
# Everything: Postgres, Redis, migrations, API, and the cron loop
docker compose up --build

# Frontend, separately — it is faster outside a container
cd apps/web && pnpm install && pnpm dev
```

The compose stack runs with `ENVIRONMENT=production` on purpose, so what
you develop against is the code path that deploys. Its header explains
what that matches and the one thing it can't.

## Before you open the PR

Run what CI runs. It's fast and it's the whole review's first pass:

```bash
cd apps/api
pytest                 # 1,277 tests, hermetic — no Postgres, no Redis, no network
ruff check app tests

cd apps/web
pnpm lint
pnpm build
```

The backend suite runs on in-memory SQLite and needs nothing external. If
it passes for you it passes in CI; most of this project's regressions were
caught there rather than in review.

## The rules that aren't negotiable

These aren't style preferences — each one is a bug this project already
had:

1. **Every query touching organization-scoped data goes through
   `app/services/permissions/service.py`.** Never a raw `select()` that
   filters by hand. This is a multi-tenant system; a missed filter is a data
   breach, not a bug.
2. **Schema changes are Alembic migrations.** Never `create_all()`, never a
   manual `ALTER` in production. Run your migration up *and* down before
   pushing it.
3. **Never commit a real secret.** Every `.env` is git-ignored; only
   `.env.example` is tracked, with placeholders. If you add a setting,
   document it there with a `change-me`-style value.
4. **Nothing invented in the UI.** Every number on screen comes from real
   data or from the demo store, and says which. No fabricated metrics, no
   made-up AI summaries.
5. **The frontend design system is a spec, not a suggestion.** Read
   `docs/DESIGN_BRIEF.md` before touching a page: colours only from the
   palette, one hue per box, green only where closed money is the subject,
   no coloured text or icons.

## Commit messages

Say **why**, not just what. This repository's history is written that way
and it's the fastest way for the next person — human or agent — to
understand a change. "Fix bug" tells nobody anything; "the padding was
inside the fixed height, so the funnel's bars overflowed the paragraph"
means the next person doesn't repeat it.

## Adding a signal analyzer

The most useful thing you can contribute, and the cheapest. Analyzers are
the extension point: a class with a decorator, and nothing else in the
system changes.

```python
from app.services.signal_engine.analyzers.base import AnalysisResult, SignalAnalyzer
from app.services.signal_engine.analyzers.registry import register_analyzer

@register_analyzer
class MyAnalyzer(SignalAnalyzer):
    name = "my_analyzer"
    priority = 100

    def supports(self, payload) -> bool: ...
    def analyze(self, payload) -> AnalysisResult: ...
```

Add it under `apps/api/app/services/signal_engine/analyzers/`, with a test.
No engine change, no endpoint change, no migration.
