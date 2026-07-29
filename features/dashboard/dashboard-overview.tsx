"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Fingerprint,
  Flame,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { RevenueSimulatorWidget } from "@/components/revenue-simulator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBattlecards } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";

const SHORTCUTS = [
  {
    href: "/dashboard/opportunities",
    icon: Target,
    label: "Oportunidades",
    detail: "Battlecards y pipeline",
    span: "bee-span-4",
    tone: "bee-bento--primary",
  },
  {
    href: "/dashboard/control",
    icon: SlidersHorizontal,
    label: "Control",
    detail: "Kanban · HexMap · Salud del sistema",
    span: "bee-span-4",
    tone: undefined,
  },
  {
    href: "/dashboard/signals",
    icon: Radio,
    label: "Señales",
    detail: "Feed completo del Signal Engine",
    span: "bee-span-4",
    tone: undefined,
  },
  {
    href: "/dashboard/dark-funnel",
    icon: Flame,
    label: "Dark Funnel",
    detail: "Investigación anónima de alta intención",
    span: "bee-span-3",
    tone: undefined,
  },
  {
    href: "/dashboard/network",
    icon: Zap,
    label: "Red",
    detail: "Caminos de introducción cálida",
    span: "bee-span-3",
    tone: undefined,
  },
  {
    href: "/dashboard/brand",
    icon: Fingerprint,
    label: "Voz de marca",
    detail: "Tono personal y perfil DISC",
    span: "bee-span-3",
    tone: "bee-bento--warm",
  },
  {
    href: "/dashboard/sequences",
    icon: Workflow,
    label: "Secuencias",
    detail: "Cadencias y bandeja de engagement",
    span: "bee-span-3",
    tone: undefined,
  },
  {
    href: "/dashboard/resilience",
    icon: ShieldCheck,
    label: "Resiliencia",
    detail: "Auditoría, DLQ y anomalías",
    span: "bee-span-12",
    tone: "bee-bento--muted",
  },
] as const;

export function DashboardOverview() {
  const { data: signalsResult, isLoading: signalsLoading } = useSignals();
  const { data: battlecardsResult, isLoading: battlecardsLoading } = useBattlecards();

  const signals = signalsResult?.data ?? [];
  const battlecards = battlecardsResult?.data ?? [];
  const live = Boolean(signalsResult?.live || battlecardsResult?.live);
  const loading = signalsLoading || battlecardsLoading;

  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const hotSignals = signals.filter((s) => s.score >= 75).length;
  const readyCount = battlecards.filter((b) => b.ready_to_action).length;
  const hotLeads = battlecards.filter((b) => b.hot_lead).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="bee-topbar -mx-5 -mt-4 mb-4 px-5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="bee-eyebrow">Inteligencia de señales</p>
            <h1 className="bee-display mt-1">Operación diaria</h1>
            <p className="bee-caption mt-1">
              Señales de mercado en tiempo real → battlecards CEO → cierre de deals
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>
            {live ? "En vivo · API conectada" : "Demo · API desconectada"}
          </Badge>
        </div>

        <div className="bee-kpi-strip">
          <MetricCard label="Señales" value={signals.length} icon={Activity} />
          <MetricCard label="Alta intención" value={hotSignals} hint="score ≥ 75" icon={TrendingUp} />
          <MetricCard label="Listas para acción" value={readyCount} hint="battlecard completo" icon={ShieldCheck} />
          <MetricCard label="Leads calientes" value={hotLeads} hint="intención de compra" icon={Flame} />
          <MetricCard label="Score medio" value={avgScore} icon={Activity} />
        </div>
      </header>

      <div className="bee-bento-grid">
        <section className="bee-span-8">
          <RevenueSimulatorWidget />
        </section>

        <section className="bee-span-4 bee-bento bee-bento-pad space-y-2">
          <p className="bee-eyebrow">Estado</p>
          <p className="bee-caption">
            {live
              ? "Todos los módulos leen de la API en vivo."
              : "Mostrando datos demo — conecta NEXT_PUBLIC_API_URL para ver datos reales."}
          </p>
        </section>

        <section className="bee-span-12 space-y-3">
          <p className="bee-eyebrow">Accesos rápidos</p>
          <h2 className="text-base font-semibold">Cada herramienta, en su propio espacio</h2>
          <div className="bee-bento-grid">
            {SHORTCUTS.map(({ href, icon: Icon, label, detail, span, tone }) => (
              <Link
                key={href}
                href={href}
                className={`${span} bee-bento ${tone ?? ""} bee-bento-pad flex items-center justify-between gap-3 transition-colors hover:border-[var(--color-chart-4)]`}
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center border border-border bg-background">
                    <Icon className="size-4 stroke-[1.25]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="bee-caption">{detail}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
