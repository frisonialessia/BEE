"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  CheckCircle2,
  Radio,
  Sparkles,
  Target,
  Wifi,
  WifiOff,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SignalPipelineEvent, SignalPipelineStage } from "@/types/control";

const STAGE_META: Record<
  SignalPipelineStage,
  { icon: typeof Radio; accent: string; line: string }
> = {
  webhook: {
    icon: Radio,
    accent: "text-[var(--color-chart-4)]",
    line: "bg-[var(--color-chart-4)]",
  },
  ingestion: {
    icon: ArrowDownToLine,
    accent: "text-[var(--color-chart-3)]",
    line: "bg-[var(--color-chart-3)]",
  },
  enrichment: {
    icon: Sparkles,
    accent: "text-[var(--color-chart-6)]",
    line: "bg-[var(--color-chart-6)]",
  },
  strategy: {
    icon: Target,
    accent: "text-[var(--color-text)]",
    line: "bg-[var(--color-text)]/20",
  },
  ready: {
    icon: CheckCircle2,
    accent: "text-[var(--color-chart-5)]",
    line: "bg-[var(--color-chart-5)]",
  },
};

function StreamItem({ event }: { event: SignalPipelineEvent }) {
  const meta = STAGE_META[event.stage];
  const Icon = meta.icon;
  const isReady = event.stage === "ready";

  const inner = (
    <div
      className={cn(
        "group relative flex gap-3 py-3 pl-1 transition-opacity duration-200",
        isReady && "rounded-xl bg-[var(--color-primary)]/60 px-2 -mx-2",
      )}
    >
      <div className="flex flex-col items-center pt-0.5">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/60",
            meta.accent,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
        </div>
        <div className={cn("mt-1 w-px flex-1 min-h-4", meta.line, "opacity-40")} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="bee-eyebrow">{event.label}</p>
        <p className="mt-0.5 line-clamp-2 text-sm font-light leading-snug tracking-tight">
          {event.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{timeAgo(event.timestamp)}</span>
          {event.score != null && (
            <span className="font-mono tabular-nums">{Math.round(event.score)}</span>
          )}
          {event.provider && (
            <span className="capitalize">{String(event.provider).replace(/_/g, " ")}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (event.opportunity_id && isReady) {
    return (
      <Link href={`/dashboard/opportunities/${event.opportunity_id}`} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}

function StreamSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 shrink-0 rounded-xl" />
      ))}
    </div>
  );
}

/**
 * SignalStream — lateral feed tracing Webhook → Enrichment → Strategy.
 *
 * Polls the backend every 8s. Toasts when a new closing strategy reaches "ready".
 */
export function SignalStream() {
  const { data: result, isLoading, isError } = useSignalStream();
  const events = result?.data.events ?? [];
  const live = result?.live ?? false;
  const readyCount = result?.data.ready_count ?? 0;

  return (
    <aside
      className="bee-surface flex h-full min-h-[var(--bee-zone-footer)] flex-col p-6"
      aria-label="Signal stream"
    >
      <div className="mb-4 flex shrink-0 items-start justify-between gap-2">
        <div>
          <h2 className="bee-eyebrow">Signal Stream</h2>
          <p className="bee-caption mt-1">Webhook → Enrichment → Strategy</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {live ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-chart-4)] opacity-40" />
                <span className="relative inline-flex size-2 rounded-full bg-[var(--color-chart-4)]" />
              </span>
              <Wifi className="size-3" />
            </>
          ) : (
            <WifiOff className="size-3" />
          )}
        </div>
      </div>

      {readyCount > 0 && (
        <p className="mb-3 shrink-0 text-xs font-light text-[var(--color-chart-5)]">
          {readyCount} strateg{readyCount === 1 ? "y" : "ies"} ready to action
        </p>
      )}

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <StreamSkeleton />
        ) : isError ? (
          <p className="text-sm font-light text-destructive">Stream unavailable.</p>
        ) : events.length === 0 ? (
          <p className="text-sm font-light text-muted-foreground">
            Waiting for inbound webhooks. POST to{" "}
            <code className="rounded bg-muted px-1 text-[11px]">/api/v1/webhooks/receive</code>
          </p>
        ) : (
          <ScrollArea className="h-full max-h-[calc(var(--bee-zone-footer)-7rem)] pr-2">
            <div className="space-y-0">
              {events.map((event) => (
                <StreamItem key={event.id} event={event} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </aside>
  );
}
