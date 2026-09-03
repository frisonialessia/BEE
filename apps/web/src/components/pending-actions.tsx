"use client";

/**
 * PendingActionsPanel — AgentOrchestrator approval queue.
 * No action executes without explicit CEO approval.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle, Clock, Mail, ShieldCheck, XCircle } from "lucide-react";

import { approveAction, getPendingActions, rejectAction } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";
import type { PendingAction } from "@/lib/types";
import { LiveBadge } from "@/components/live-badge";

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  send_email: <Mail className="size-4 stroke-[1.25]" />,
};

// Mirrors the translated `status.*` keys — kept as a plain set (not read
// from the messages themselves) just to know, without throwing, whether a
// given backend status has a translation before asking next-intl for it;
// an unrecognized status (the backend's status enum can grow) falls back
// to the raw value instead of a missing-key error.
const KNOWN_STATUSES = new Set([
  "pending_approval",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed",
]);

const STATUS_STYLES: Record<string, string> = {
  pending_approval: "bg-[color-mix(in_srgb,var(--color-chart-1)_25%,var(--color-background))]",
  approved: "bg-[color-mix(in_srgb,var(--color-chart-5)_20%,var(--color-background))]",
  rejected: "bg-[color-mix(in_srgb,var(--color-chart-2)_20%,var(--color-background))]",
  executing: "bg-[color-mix(in_srgb,var(--color-chart-4)_20%,var(--color-background))]",
  completed: "bg-primary",
  failed: "bg-[color-mix(in_srgb,var(--color-chart-2)_20%,var(--color-background))]",
};

interface PendingActionCardProps {
  action: PendingAction;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

function PendingActionCard({ action, onApprove, onReject }: PendingActionCardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.pendingActions");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function handleApprove() {
    setLoading("approve");
    try {
      await onApprove(action.id);
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    setLoading("reject");
    try {
      await onReject(action.id);
    } finally {
      setLoading(null);
    }
  }

  const isPending = action.status === "pending_approval";
  const statusLabel = KNOWN_STATUSES.has(action.status)
    ? t(`status.${action.status}` as "status.pending_approval")
    : action.status.replace(/_/g, " ");

  return (
    <div className="bee-bento bee-outline--blue bee-bento-pad space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">
            {ACTION_TYPE_ICONS[action.action_type] ?? (
              <Clock className="size-4 stroke-[1.25]" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{action.title}</p>
            {action.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {action.description}
              </p>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-sm border border-border px-2 py-1 text-micro font-medium uppercase tracking-wide ${STATUS_STYLES[action.status] ?? "bg-background"}`}
        >
          {statusLabel}
        </span>
      </div>

      {action.preview && isPending && (
        // Full content, never clipped mid-sentence: this is what a CEO
        // reads before an irreversible approve/reject decision, so a
        // scrollable box (not a hard line-clamp) is the floor here, not a
        // nice-to-have. max-h caps how much vertical space one card can
        // take in the queue; overflow-y-auto is what actually lets the
        // rest of a long email be read instead of disappearing past it.
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-sm border border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {action.preview}
        </div>
      )}

      {action.retry_count > 0 && (
        <p className="text-xs" style={{ color: "var(--color-chart-2)" }}>
          {t("retryCount", { count: action.retry_count })}
        </p>
      )}

      {isPending && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={!!loading}
            className="bee-btn flex-1"
          >
            <CheckCircle className="size-3.5" />
            {loading === "approve" ? t("approving") : t("approve")}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={!!loading}
            className="bee-btn flex-1 bg-background"
          >
            <XCircle className="size-3.5" />
            {loading === "reject" ? t("rejecting") : t("reject")}
          </button>
        </div>
      )}

      {action.approved_by && (
        <p className="bee-micro">
          {t("approvedBy", { name: action.approved_by })}
          {action.approved_at &&
            ` · ${formatDate(action.approved_at, locale)}`}
        </p>
      )}
    </div>
  );
}

export function PendingActionsPanel() {
  const t = useTranslations("probarNetworkBrandControl.pendingActions");
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    getPendingActions(20).then((res) => {
      setActions(res.data);
      setLive(res.live);
      setLoading(false);
    });
  }, []);

  async function handleApprove(id: string) {
    await approveAction(id, "CEO");
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "approved" as const } : a))
    );
  }

  async function handleReject(id: string) {
    await rejectAction(id);
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "rejected" as const } : a))
    );
  }

  const pendingCount = actions.filter((a) => a.status === "pending_approval").length;

  return (
    <div className="bee-bento bee-bento-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 bee-card-title">
            <ShieldCheck className="size-4 stroke-[1.25]" style={{ color: "var(--color-chart-5)" }} />
            {t("title")}
          </h3>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LiveBadge live={live} />
          {pendingCount > 0 && (
            <span
              className="rounded-sm border border-border px-2 py-1 text-xs font-semibold"
              style={{
                background: "color-mix(in srgb, var(--color-chart-1) 25%, var(--color-background))",
              }}
            >
              {t("pendingCount", { count: pendingCount })}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-sm" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle
            className="mx-auto mb-2 size-6 stroke-[1.25]"
            style={{ color: "var(--color-chart-5)" }}
          />
          <p className="text-xs text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 bee-micro">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 bee-micro">
        <span
          className="inline-block size-1.5"
          style={{ background: "var(--color-chart-1)" }}
        />
        {t("safetyGate")}
      </p>
    </div>
  );
}
