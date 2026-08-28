# BEE Control Dashboard — Architecture

Minimalist editorial UI for the Signals & Strategy control plane.

## Folder structure

```
src/features/control/
├── components/
│   ├── SystemHealth.tsx    ✅ Worker + provider status (live polling)
│   ├── SignalStream.tsx    ✅ Live pipeline feed + proactive toasts
│   ├── LeadWorkspace.tsx   ✅ Kanban · 12s poll
│   └── SignalHexMap.tsx    ✅ Hive heatmap · d3-hexbin + Canvas
├── hooks/                  (future: useSignalStream, useLeadBoard)
└── index.ts

src/types/control.ts        ProviderStatus, WorkerHealth, SignalPipelineEvent, LeadCard
src/lib/api/control.ts      fetchSystemHealth, fetchIngestionStatus
src/lib/api/index.ts        beeApi — centralized client (X-API-Key)
src/hooks/queries/use-system-health.ts
```

## Types (import from `@/types`)

| Type | Purpose |
|------|---------|
| `ProviderStatus` | LinkedIn / G2 / Google — configured, webhook, rate limit |
| `WorkerHealth` | IngestionWorker queue, processed, errors, load |
| `SystemHealthSnapshot` | Aggregated widget payload |
| `SignalPipelineEvent` | SignalStream feed item |
| `LeadCard` | Kanban card with strategy |

## API endpoints consumed

| Endpoint | Used by |
|----------|---------|
| `GET /api/v1/health` | SystemHealth — liveness + environment |
| `GET /api/v1/ready` | SystemHealth — DB connectivity |
| `GET /api/v1/webhooks/status` | SystemHealth — worker + providers |

## Real-time strategy

TanStack Query `refetchInterval: 10_000` on SystemHealth — no manual refresh.
Future: toast via Sonner when `ready_to_action` count increases.

## Visual system

CSS scope `.bee-control` on dashboard layout:

- `--bee-canvas` — warm off-white background
- `--bee-surface-primary` / `--bee-surface-secondary` — box backgrounds (#c8d7f8 / #dbdeff)
- `--bee-chart-*` — graph palette (#ffb213 … #c197ff)
- `.bee-surface` — soft shadow panels, no borders
