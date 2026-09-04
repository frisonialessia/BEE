"use client";

import { ArrowRight, CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Meeting } from "@/types/domain";

/** A drop waiting for the rep's OK — the meeting as it is today plus the
 * start it would move to. Nothing is saved until they press "Reagendar". */
export interface PendingReschedule {
  meeting: Meeting;
  newStartsAt: string;
}

/**
 * "¿Reagendar esta junta?" — the warning the founder asked for when a
 * meeting is dragged to another day: a centered modal (this is a
 * confirmation, not a side panel) showing the meeting and old → new
 * date/time, with "Reagendar" as the primary action. Escape, the overlay
 * and "Cancelar" all cancel — the block never moved, so there's nothing to
 * undo. Rendered always so Radix animates open/close; `pending` null =
 * closed.
 */
export function RescheduleDialog({
  pending,
  formatWhen,
  saving,
  onConfirm,
  onCancel,
}: {
  pending: PendingReschedule | null;
  /** ISO instant → "mié 9 sep, 10:30" in the viewer's locale and timezone. */
  formatWhen: (iso: string) => string;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("calendar");
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        {pending && (
          <>
            <DialogHeader>
              <DialogTitle className="bee-display flex items-center gap-2 text-lg">
                <CalendarClock className="size-4 shrink-0 text-[var(--color-text)]" aria-hidden="true" />
                {t("reschedule.title")}
              </DialogTitle>
              <DialogDescription>{t("reschedule.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm font-semibold">{pending.meeting.title}</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-md border border-border bg-[var(--color-card)] px-3 py-2">
                  <p className="bee-micro">{t("reschedule.from")}</p>
                  <p className="text-sm tabular-nums">{formatWhen(pending.meeting.starts_at)}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-chart-4)", background: "var(--color-primary)" }}>
                  <p className="bee-micro text-[var(--color-text)]">{t("reschedule.to")}</p>
                  <p className="text-sm font-medium tabular-nums text-[var(--color-text)]">{formatWhen(pending.newStartsAt)}</p>
                </div>
              </div>
              <p className="bee-caption">
                {t("reschedule.durationKept", { minutes: pending.meeting.duration_minutes })}
              </p>
            </div>
            <DialogFooter className="mt-2 gap-2">
              <button type="button" onClick={onCancel} disabled={saving} className="bee-btn-ghost">
                {t("reschedule.cancel")}
              </button>
              <button type="button" onClick={onConfirm} disabled={saving} className="bee-btn bee-btn--primary">
                {saving ? t("reschedule.saving") : t("reschedule.confirm")}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
