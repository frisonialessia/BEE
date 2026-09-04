"use client";

import {
  ArrowDownToLine,
  CircleCheck,
  Radio,
  Sparkles,
  Target,
  WifiOff,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { SignalPipelineEvent, SignalPipelineStage } from "@/types/control";

const STAGE_ICON: Record<SignalPipelineStage, typeof Radio> = {
  webhook: Radio,
  ingestion: ArrowDownToLine,
  enrichment: Sparkles,
  strategy: Target,
  ready: CircleCheck,
};

function StreamItem({
  event,
  onOpen,
}: {
  event: SignalPipelineEvent;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("probarNetworkBrandControl.control.signalStream");
  const locale = useLocale() as Locale;
  const Icon = STAGE_ICON[event.stage];
  const isReady = event.stage === "ready";
  const clickable = Boolean(event.opportunity_id && isReady);

  return (
    <li>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => event.opportunity_id && onOpen(event.opportunity_id)}
        // The technical stage label (IngestionWorker, EnrichmentContext…)
        // stays as a hover title for whoever wants it; the visible word is
        // the plain one from stages.*.
        title={event.label}
        className={cn(
          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left",
          clickable ? "cursor-pointer transition-colors hover:bg-[var(--color-primary)]/40" : "cursor-default",
        )}
      >
        {/* One hue per box: indigo, full strength for a ready strategy,
            a pale wash for the steps before it. */}
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: isReady ? DATA.indigo : mix(DATA.indigo, 18), color: isReady ? "var(--color-card)" : DATA.indigo }}
        >
          <Icon className="size-3.5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">{t(`stages.${event.stage}`)}</span>
          <span className="block truncate text-sm text-muted-foreground">{event.title}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block bee-micro">{formatRelativeTime(event.timestamp, locale)}</span>
          {event.score != null && (
            <span className="block text-xs font-bold tabular-nums">{Math.round(event.score)}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Actividad reciente — the last signals that came in and what BEE did with
 * each one, newest first. Every row is one step (received → analyzed →
 * enriched → strategy → ready); a "ready" row opens the opportunity. Polls
 * every 8 s and toasts when a new strategy becomes ready (see the hook).
 */
export function SignalStream() {
  const t = useTranslations("probarNetworkBrandControl.control.signalStream");
  const { data: result, isLoading, isError } = useSignalStream();
  const { openOpportunity } = useOpportunityDrawer();
  const events = result?.data.events ?? [];
  const live = result?.live ?? false;
  const readyCount = result?.data.ready_count ?? 0;

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("caption")}
      action={
        <div className="flex items-center gap-2">
          {readyCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: mix(DATA.indigo, 22) }}>
              {t("readyCount", { count: readyCount })}
            </span>
          )}
          {live ? (
            <span className="relative flex size-2" title={t("liveHint")}>
              <span className="absolute inline-flex size-full animate-ping rounded-full opacity-40" style={{ background: DATA.indigo }} />
              <span className="relative inline-flex size-2 rounded-full" style={{ background: DATA.indigo }} />
            </span>
          ) : (
            <WifiOff className="size-3.5 text-[var(--color-text-muted)]" aria-hidden />
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-6 text-sm text-muted-foreground">{t("unavailable")}</p>
      ) : events.length === 0 ? (
        <p className="bee-caption py-8 text-center">{t("waiting")}</p>
      ) : (
        <ul className="max-h-[17rem] overflow-y-auto overscroll-contain">
          {events.map((event) => (
            <StreamItem key={event.id} event={event} onOpen={openOpportunity} />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
