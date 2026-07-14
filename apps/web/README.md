# BEE Frontend — Señales y Estrategia Dashboard

Next.js App Router frontend for the BEE Sales Force Intelligence platform.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, React 19) |
| Styling | Tailwind CSS v4 + shadcn/ui (new-york) |
| Data fetching | TanStack Query v5 |
| Types | TypeScript — mirrored from `apps/api/app/schemas/` |

## Folder structure

```
apps/web/src/
├── app/
│   ├── dashboard/                # /dashboard/* routes
│   │   ├── layout.tsx            # Shell + DashboardNav
│   │   ├── page.tsx              # Overview (KPIs + subsystems)
│   │   ├── signals/page.tsx      # Signal feed
│   │   ├── strategies/page.tsx     # Battlecards + pipeline
│   │   └── opportunities/[id]/    # Detail + execution artifacts
│   ├── layout.tsx                # Root + AppProviders
│   └── page.tsx                  # Marketing landing
├── types/
│   ├── domain.ts                 # ★ Master types (Signal, Opportunity, StrategySchema, Battlecard)
│   ├── api.ts                    # FetchResult, ApiError
│   ├── extended.ts               # Subsystem types (orchestrator, DLQ, etc.)
│   └── index.ts                  # Single import surface
├── lib/
│   ├── api/
│   │   ├── client.ts             # apiFetch + X-API-Key headers
│   │   ├── signals.ts
│   │   └── opportunities.ts
│   ├── api.ts                    # Legacy barrel (migrating to lib/api/*)
│   ├── query-keys.ts             # TanStack Query key factory
│   └── env.ts                    # Zod-validated public env
├── hooks/
│   ├── queries/                  # useSignals, useBattlecards, useArtifacts…
│   └── mutations/                # useRecordOutcome
├── features/
│   ├── dashboard/                # Overview feature module
│   ├── signals/                  # Signals dashboard
│   └── strategy/                 # Strategies dashboard
├── components/
│   ├── dashboard/                # DashboardNav, shared shell
│   └── ui/                       # shadcn primitives
└── providers/
    └── app-providers.tsx         # QueryClient + Theme + Toaster
```

## Master types

Import domain types from `@/types`:

```typescript
import type { Signal, Opportunity, StrategySchema, Battlecard } from "@/types";
```

These mirror:

- `apps/api/app/schemas/signal.py` → `Signal`, `Opportunity`
- `apps/api/app/schemas/strategy.py` → `StrategySchema`, `Battlecard`

## Development

```bash
cd apps/web
cp .env.example .env.local
pnpm install
pnpm dev
```

Open http://localhost:3000/dashboard

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | BEE API base URL |
| `NEXT_PUBLIC_BEE_API_KEY` | Prod | Matches backend `API_SECRET_KEY` |
