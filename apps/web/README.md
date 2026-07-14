# BEE web — Sales Force Intelligence frontend

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui.

A premium, minimalist interface for BEE: a marketing landing page and a live
**Signal Intelligence** dashboard that visualizes the market signals detected by
the backend Signal Engine and the opportunities generated from them.

## Structure

```
src/
├── app/
│   ├── page.tsx            Landing (hero · pipeline · features)
│   ├── dashboard/page.tsx  Signal Intelligence dashboard
│   ├── layout.tsx          Root layout (fonts, dark theme)
│   └── globals.css         BEE design tokens (shadcn/ui, Tailwind v4)
├── components/
│   ├── ui/                 shadcn/ui primitives (button, card, badge)
│   ├── signal-card.tsx     A detected market signal
│   ├── opportunity-card.tsx  Lead + signal + strategy
│   ├── metric-card.tsx     KPI tile
│   ├── site-header.tsx     Top navigation
│   └── logo.tsx            BEE hexagon wordmark
└── lib/
    ├── api.ts              API client (graceful fallback to sample data)
    ├── types.ts            Domain types (mirror the API contract)
    ├── format.ts           Labels & formatting helpers
    └── sample-data.ts      Illustrative data for offline previews
```

## Getting started

```bash
cp .env.example .env.local     # set NEXT_PUBLIC_API_URL
pnpm install
pnpm dev                       # http://localhost:3000
```

The dashboard automatically connects to the API at `NEXT_PUBLIC_API_URL`. When
the API is unreachable it renders illustrative sample data and shows a
"Demo data · API offline" badge, so the UI is always viewable.

## Scripts

```bash
pnpm dev      # dev server
pnpm build    # production build
pnpm start    # serve the production build
pnpm lint     # eslint
```
