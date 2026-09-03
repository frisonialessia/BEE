"use client";

import { useTranslations } from "next-intl";

import { DashboardOverview } from "@/features/dashboard/dashboard-overview";
import { AddCompanyForm } from "@/features/probar/add-company-form";

/** Landing page of the sandbox — the real Dashboard's Resumen, unchanged,
 * over the local demo dataset. It used to be a trimmed layout of its own
 * (a 4-tile KPI strip and a subset of the widgets); a visitor evaluating
 * BEE should see exactly what a customer sees, including the Bandeja de
 * Decisiones, the daily brief, critical accounts and the battlecards, all
 * populated. Every section reads through the same hooks as the real page;
 * `lib/api/*` routes them to `lib/demo/*` because the path starts with
 * `/probar` (see lib/demo/mode.ts). The one sandbox-only control is the
 * "Simula tu empresa" form, slotted next to the status badge. */
export default function ProbarOverviewPage() {
  const t = useTranslations("probar.overview");
  return <DashboardOverview headerAction={<AddCompanyForm />} statusLabel={t("badge")} />;
}
