"use client";

import { DashboardOverview } from "@/features/dashboard/dashboard-overview";

/** Landing page of the sandbox — the real Dashboard's Resumen, unchanged,
 * over the local demo dataset. A visitor evaluating BEE sees exactly what a
 * customer sees, every section populated. Every section reads through the
 * same hooks as the real page; `lib/api/*` routes them to `lib/demo/*`
 * because the path starts with `/probar` (see lib/demo/mode.ts). The
 * "datos demo" state is stated once, in the sandbox header, never per page. */
export default function ProbarOverviewPage() {
  return <DashboardOverview />;
}
