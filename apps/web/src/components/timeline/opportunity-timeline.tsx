"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/locales";
import { formatDateTimePadded } from "@/lib/i18n/format";
import { getAuditDecisions } from "@/lib/api";
import type { AuditEntry } from "@/types/extended";

const AGENT_DOT_COLOR: Record<string, string> = {
  strategy_generator: "var(--color-chart-1)",
  executive_agent: "var(--color-chart-4)",
  psychographic_analyzer: "var(--color-chart-6)",
  dark_funnel: "var(--color-chart-2)",
  smart_engagement: "var(--color-chart-5)",
  agent_orchestrator: "var(--color-chart-3)",
  workflow_orchestrator: "var(--color-chart-3)",
  trend_analyst: "var(--color-chart-4)",
};

function timeLabel(iso: string, locale: Locale) {
  return formatDateTimePadded(iso, locale);
}

/**
 * OpportunityTimeline — historial real de qué hizo cada agente de BEE sobre
 * esta oportunidad, y cuándo. Se arma directamente del AuditTrailService
 * (ya existía, registra cada decisión) — no es un log inventado.
 */
export function OpportunityTimeline({ opportunityId }: { opportunityId: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("sharedB.timeline");
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAuditDecisions({ opportunity_id: opportunityId, limit: 50 }).then((result) => {
      if (!cancelled) setEntries(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  if (entries === null) {
    return <Skeleton className="h-32" />;
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <ol className="space-y-0">
      {sorted.map((entry, i) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < sorted.length - 1 && (
            <span className="absolute left-[5px] top-3 h-full w-px bg-border" aria-hidden />
          )}
          <span
            className="relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-background"
            style={{ background: AGENT_DOT_COLOR[entry.agent_type] ?? "var(--color-text-muted)" }}
          />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">
                {t.has(`agentLabels.${entry.agent_type}`)
                  ? t(`agentLabels.${entry.agent_type}`)
                  : entry.agent_type}
              </p>
              <span className="text-xs text-muted-foreground">
                {entry.decision_type.replace(/_/g, " ")}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {timeLabel(entry.created_at, locale)}
              </span>
            </div>
            {entry.strategy_reasoning && (
              <p className="mt-1 text-xs text-muted-foreground">{entry.strategy_reasoning}</p>
            )}
            {entry.manual_review_required && (
              <p className="mt-1 text-xs font-medium" style={{ color: "var(--color-chart-2)" }}>
                {t("manualReviewRequired", { confidence: (entry.confidence_score * 100).toFixed(0) })}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
