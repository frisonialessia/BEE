"use client";

/**
 * Cola de ejecución — the AgentOrchestrator approval queue: everything BEE
 * drafted (an email, a LinkedIn note, a CRM update…) and is holding until a
 * person says yes. Nothing here executes without that explicit approval.
 */

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { TONE } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { EmptyLine, RowsSkeleton, StateChip, StateWord, useFittedRows, ViewAllButton, type DotLevel } from "@/features/control/components/primitives";
import { useApproveAction, usePendingActions, useRejectAction } from "@/hooks/queries/use-pending-actions";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import type { PendingAction } from "@/lib/types";

/** The queue is what wants a person: magenta. Waiting is the full hue,
 *  moving is 70, done is 45, and anything closed without going out is
 *  REST — the word says which. */
const HUE = TONE.urgency;

const KNOWN_TYPES = new Set(["send_email", "linkedin_message", "crm_update", "book_meeting", "slack_notify", "webhook_call"]);

// Mirrors the translated `status.*` keys — a plain map so an unrecognized
// backend status (the enum can grow) falls back to the raw value instead of
// a missing-key error.
const STATUS_LEVEL: Record<string, DotLevel> = {
  pending_approval: 100,
  approved: 70,
  executing: 70,
  completed: 45,
  rejected: "rest",
  failed: "rest",
};

const STATUS_ORDER: Record<string, number> = {
  pending_approval: 0,
  executing: 1,
  approved: 2,
  failed: 3,
  completed: 4,
  rejected: 5,
};

/** Row height contract with useFittedRows: two lines + padding. */
const ROW_PX = 57;

function PendingActionRow({
  action,
  onApprove,
  onReject,
}: {
  action: PendingAction;
  onApprove: (id: string) => Promise<unknown>;
  onReject: (id: string) => Promise<unknown>;
}) {
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
  const statusLabel = action.status in STATUS_LEVEL ? t(`status.${action.status}` as "status.pending_approval") : action.status.replace(/_/g, " ");
  const typeLabel = KNOWN_TYPES.has(action.action_type) ? t(`types.${action.action_type}` as "types.send_email") : action.action_type.replace(/_/g, " ");
  const meta = [typeLabel, action.retry_count > 0 ? t("retryCount", { count: action.retry_count }) : null, action.approved_by ? `${t("approvedBy", { name: action.approved_by })}${action.approved_at ? ` · ${formatDate(action.approved_at, locale)}` : ""}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="bee-row flex-wrap justify-between sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium leading-snug" title={action.description ?? undefined}>
          {action.title}
        </p>
        <p className="truncate bee-micro">
          {meta}
          {action.preview && (
            <>
              {" · "}
              <button type="button" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview} className="font-medium text-[var(--color-text)] hover:underline">
                {showPreview ? t("hidePreview") : t("showPreview")}
              </button>
            </>
          )}
        </p>
      </div>
      <StateWord hue={HUE} level={STATUS_LEVEL[action.status] ?? "rest"}>
        {statusLabel}
      </StateWord>
      {isPending && (
        <span className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => run("approve")} disabled={!!loading} className="bee-btn-ghost text-xs">
            {loading === "approve" ? t("approving") : t("approve")}
          </button>
          <button type="button" onClick={() => run("reject")} disabled={!!loading} className="bee-btn-ghost text-xs">
            {loading === "reject" ? t("rejecting") : t("reject")}
          </button>
        </span>
      )}
      {showPreview && action.preview && (
        // Full content, never clipped mid-sentence: this is what a person
        // reads before an irreversible approve/reject decision.
        <div className="basis-full whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-background)] p-3 text-xs leading-relaxed">{action.preview}</div>
      )}
    </li>
  );
}

export function PendingActionsPanel() {
  const t = useTranslations("probarNetworkBrandControl.pendingActions");
  const { data: result, isLoading } = usePendingActions(20);
  const approve = useApproveAction();
  const reject = useRejectAction();

  const actions = [...(result?.data ?? [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  const pendingCount = actions.filter((a) => a.status === "pending_approval").length;
  const [listRef, rows, fit] = useFittedRows(actions, ROW_PX);

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("caption")}
      className={fit.expanded ? undefined : "lg:h-[22rem]!"}
      action={
        <div className="flex shrink-0 items-center gap-2">
          <LiveBadge live={result?.live ?? false} />
          {pendingCount > 0 && (
            <StateChip hue={HUE} level={45}>
              {t("pendingCount", { count: pendingCount })}
            </StateChip>
          )}
        </div>
      }
    >
      {isLoading ? (
        <RowsSkeleton rows={3} />
      ) : actions.length === 0 ? (
        <EmptyLine>{t("emptyTitle")}</EmptyLine>
      ) : (
        <>
          <ul ref={listRef} className={fit.expanded ? "bee-fill min-h-0" : "bee-fill min-h-0 overflow-hidden"}>
            {rows.map((action) => (
              <PendingActionRow key={action.id} action={action} onApprove={(id) => approve.mutateAsync({ id, approvedBy: "CEO" })} onReject={(id) => reject.mutateAsync({ id })} />
            ))}
          </ul>
          <ViewAllButton hidden={fit.hidden} expanded={fit.expanded} onToggle={fit.toggle} />
        </>
      )}
      <p className="mt-2 bee-micro">{t("safetyGate")}</p>
    </OverviewCard>
  );
}
