"use client";

/**
 * Cola de ejecución — the AgentOrchestrator approval queue: everything BEE
 * drafted (an email, a LinkedIn note, a CRM update…) and is holding until a
 * person says yes. Nothing here executes without that explicit approval.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock,
  Database,
  Mail,
  MessageSquare,
  RotateCw,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useApproveAction, usePendingActions, useRejectAction } from "@/hooks/queries/use-pending-actions";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import type { PendingAction } from "@/lib/types";

const ACTION_TYPE_ICONS: Record<string, LucideIcon> = {
  send_email: Mail,
  linkedin_message: MessageSquare,
  crm_update: Database,
  book_meeting: CalendarDays,
  slack_notify: Bell,
  webhook_call: Webhook,
};

const KNOWN_TYPES = new Set(Object.keys(ACTION_TYPE_ICONS));

// Mirrors the translated `status.*` keys — a plain set so an unrecognized
// backend status (the enum can grow) falls back to the raw value instead of
// a missing-key error.
const STATUS_META: Record<string, { tone: StatusTone; icon: LucideIcon }> = {
  pending_approval: { tone: "attention", icon: Clock },
  approved: { tone: "ok", icon: CircleCheck },
  executing: { tone: "ok", icon: RotateCw },
  completed: { tone: "ok", icon: CircleCheck },
  rejected: { tone: "neutral", icon: CircleX },
  failed: { tone: "failed", icon: CircleX },
};

const STATUS_ORDER: Record<string, number> = {
  pending_approval: 0,
  executing: 1,
  approved: 2,
  failed: 3,
  completed: 4,
  rejected: 5,
};

interface PendingActionCardProps {
  action: PendingAction;
  onApprove: (id: string) => Promise<unknown>;
  onReject: (id: string) => Promise<unknown>;
}

function PendingActionCard({ action, onApprove, onReject }: PendingActionCardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.pendingActions");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  async function run(kind: "approve" | "reject") {
    setLoading(kind);
    try {
      await (kind === "approve" ? onApprove(action.id) : onReject(action.id));
    } finally {
      setLoading(null);
    }
  }

  const isPending = action.status === "pending_approval";
  const meta = STATUS_META[action.status] ?? { tone: "neutral" as StatusTone, icon: Clock };
  const statusLabel = STATUS_META[action.status]
    ? t(`status.${action.status}` as "status.pending_approval")
    : action.status.replace(/_/g, " ");
  const TypeIcon = ACTION_TYPE_ICONS[action.action_type] ?? Clock;
  const typeLabel = KNOWN_TYPES.has(action.action_type)
    ? t(`types.${action.action_type}` as "types.send_email")
    : action.action_type.replace(/_/g, " ");

  return (
    <li className="bee-bento bee-bento-pad space-y-3" style={isPending ? { background: mix(DATA.honey, 6) } : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: mix(DATA.honey, 20) }}>
            <TypeIcon className="size-4 text-[var(--color-text)]" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="bee-micro">{typeLabel}</p>
            <p className="text-sm font-semibold leading-snug">{action.title}</p>
            {action.description && <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>}
          </div>
        </div>
        <StatusChip tone={meta.tone} icon={meta.icon} label={statusLabel} />
      </div>

      {action.preview && (
        <div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            {showPreview ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            {showPreview ? t("hidePreview") : t("showPreview")}
          </button>
          {showPreview && (
            // Full content, never clipped mid-sentence: this is what a
            // person reads before an irreversible approve/reject decision.
            // max-h caps one card's footprint; the box scrolls past it.
            <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-background p-3 text-xs leading-relaxed">
              {action.preview}
            </div>
          )}
        </div>
      )}

      {action.retry_count > 0 && (
        <p className="flex items-center gap-1.5 bee-micro">
          <RotateCw className="size-3" aria-hidden />
          {t("retryCount", { count: action.retry_count })}
        </p>
      )}

      {isPending && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run("approve")} disabled={!!loading} className="bee-btn bee-btn--primary">
            <CircleCheck className="size-3.5" aria-hidden />
            {loading === "approve" ? t("approving") : t("approve")}
          </button>
          <button type="button" onClick={() => run("reject")} disabled={!!loading} className="bee-btn-ghost">
            <CircleX className="size-3.5" aria-hidden />
            {loading === "reject" ? t("rejecting") : t("reject")}
          </button>
        </div>
      )}

      {action.approved_by && (
        <p className="bee-micro">
          {t("approvedBy", { name: action.approved_by })}
          {action.approved_at && ` · ${formatDate(action.approved_at, locale)}`}
        </p>
      )}
    </li>
  );
}

export function PendingActionsPanel() {
  const t = useTranslations("probarNetworkBrandControl.pendingActions");
  const { data: result, isLoading } = usePendingActions(20);
  const approve = useApproveAction();
  const reject = useRejectAction();

  const actions = [...(result?.data ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );
  const pendingCount = actions.filter((a) => a.status === "pending_approval").length;

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("caption")}
      action={
        <div className="flex shrink-0 items-center gap-2">
          <LiveBadge live={result?.live ?? false} />
          {pendingCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ background: mix(DATA.honey, 30) }}>
              {t("pendingCount", { count: pendingCount })}
            </span>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <CircleCheck className="size-5 text-[var(--color-chart-4)]" aria-hidden />
          <p className="text-sm">{t("emptyTitle")}</p>
          <p className="bee-micro">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <ul className="max-h-[34rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {actions.map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApprove={(id) => approve.mutateAsync({ id, approvedBy: "CEO" })}
              onReject={(id) => reject.mutateAsync({ id })}
            />
          ))}
        </ul>
      )}

      <p className="mt-3 flex items-start gap-1.5 bee-micro">
        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
        {t("safetyGate")}
      </p>
    </OverviewCard>
  );
}
