"use client";

import {
  ArrowDownToLine,
  CheckCircle2,
  Radio,
  Sparkles,
  Target,
  WifiOff,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { SignalPipelineEvent, SignalPipelineStage } from "@/types/control";

const STAGE_META: Record<
  SignalPipelineStage,
  { icon: typeof Radio; accent: string; line: string }
> = {
  webhook: { icon: Radio, accent: "text-[var(--color-chart-4)]", line: "bg-[var(--color-chart-4)]" },
  ingestion: { icon: ArrowDownToLine, accent: "text-[var(--color-chart-3)]", line: "bg-[var(--color-chart-3)]" },
  enrichment: { icon: Sparkles, accent: "text-[var(--color-chart-6)]", line: "bg-[var(--color-chart-6)]" },
  strategy: { icon: Target, accent: "text-[var(--color-text)]", line: "bg-[var(--color-text)]/20" },
  ready: { icon: CheckCircle2, accent: "text-[var(--color-chart-5)]", line: "bg-[var(--color-chart-5)]" },
};

function StreamItem({
  event,
  onOpen,
}: {
  event: SignalPipelineEvent;
  onOpen: (id: string) => void;
}) {
  const locale = useLocale() as Locale;
  const meta = STAGE_META[event.stage];
  const Icon = meta.icon;
  const isReady = event.stage === "ready";
  const clickable = Boolean(event.opportunity_id && isReady);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => event.opportunity_id && onOpen(event.opportunity_id)}
      className={cn(
        "group relative flex w-full gap-4 py-3 pl-1 text-left transition-opacity duration-200",
        isReady && "rounded-lg bg-[var(--color-primary)]/60 px-2 -mx-2",
        clickable && "cursor-pointer hover:opacity-90",
        !clickable && "cursor-default",
      )}
    >
      <div className="flex flex-col items-center pt-1">
        <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]", meta.accent)}>
          <Icon className="size-3.5" strokeWidth={1.75} />
        </div>
        <div className={cn("mt-1 w-px flex-1 min-h-4", meta.line, "opacity-40")} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="bee-eyebrow">{event.label}</p>
        <p className="mt-1 line-clamp-2 text-sm font-light leading-snug tracking-tight">
          {event.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 bee-micro">
          <span>{formatRelativeTime(event.timestamp, locale)}</span>
          {event.score != null && (
            <span className="font-mono tabular-nums">{Math.round(event.score)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/** SignalStream — pipeline feed; ready items open CRM drawer. */
export function SignalStream() {
  const t = useTranslations("probarNetworkBrandControl.control.signalStream");
  const { data: result, isLoading, isError } = useSignalStream();
  const { openOpportunity } = useOpportunityDrawer();
  const events = result?.data.events ?? [];
  const live = result?.live ?? false;
  const readyCount = result?.data.ready_count ?? 0;

  return (
    // overflow-hidden here (matching SignalHexMap's own root, its column
    // sibling) is the outer guarantee: whatever the ScrollArea does inside,
    // nothing — a scrolled row, its connector line, a highlighted item's
    // -mx-2 bleed — can ever render past this card's own rounded border.
    // h-full: one of three equal-height siblings in the grid's bottom row
    // (see ControlLayout/globals.css) — the row claims the remaining
    // viewport height and this card stretches to match its APIs
    // externas/Anomalías siblings.
    <aside className="bee-surface flex h-full min-h-[200px] flex-col overflow-hidden bee-bento-pad" aria-label={t("ariaLabel")}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-2">
        <div>
          <h2 className="bee-eyebrow">{t("title")}</h2>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </div>
        {live ? (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-chart-4)] opacity-40" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--color-chart-4)]" />
          </span>
        ) : (
          <WifiOff className="size-3 text-[var(--color-text-muted)]" />
        )}
      </div>

      {readyCount > 0 && (
        <p className="mb-2 shrink-0 text-xs text-[var(--color-chart-5)]">
          {t("readyCount", { count: readyCount })}
        </p>
      )}

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--color-chart-2)]">{t("unavailable")}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t("waiting")}</p>
        ) : (
          // h-full (not a fixed h-[220px]): this card sits in a flex column
          // (min-h-0 flex-1 above), so it now takes whatever room the
          // column actually has instead of hard-capping at 220px — the
          // column's own overflow-y-auto (.bee-crm-control__viz) is still
          // the backstop if the event list is genuinely longer than that.
          <ScrollArea className="h-full pr-2">
            <div>
              {events.map((event) => (
                <StreamItem key={event.id} event={event} onOpen={openOpportunity} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </aside>
  );
}
