"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useRecordOutcome } from "@/hooks/mutations/use-record-outcome";
import { getLossReasonLabels, lossReasonLabels } from "@/lib/format";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";
import { CLOSED_OPPORTUNITY_STATUSES, type LossReason, type Opportunity } from "@/types/domain";

const LOSS_REASONS = Object.keys(lossReasonLabels) as LossReason[];

/**
 * RecordOutcomePanel — captura el desenlace (ganada/perdida) de una
 * oportunidad abierta, incluyendo el detalle estructurado que alimenta
 * Ganado/Perdido (razón de pérdida, competidor). Antes de esto,
 * `useRecordOutcome` existía pero ninguna pantalla lo usaba — no había
 * forma de registrar un desenlace desde la UI, solo vía API directa.
 *
 * Una vez cerrada, la oportunidad no se puede volver a marcar (el backend
 * es idempotente) — el panel pasa a solo mostrar lo que quedó registrado.
 */
export function RecordOutcomePanel({ opportunity }: { opportunity: Opportunity }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("sharedB.outcome");
  const lossReasonLabelsForLocale = getLossReasonLabels(locale);
  const recordOutcome = useRecordOutcome(opportunity.id);
  const [mode, setMode] = useState<"won" | "lost" | null>(null);
  const [lossReason, setLossReason] = useState<LossReason | "">("");
  const [competitor, setCompetitor] = useState("");
  const [notes, setNotes] = useState("");

  const isClosed = CLOSED_OPPORTUNITY_STATUSES.includes(opportunity.status);

  if (isClosed) {
    const won = opportunity.status === "won";
    const lost = opportunity.status === "lost";
    return (
      <section className="bee-surface bee-bento-pad">
        <div className="mb-1 flex items-center gap-2">
          {won && <CheckCircle2 className="size-4 text-[var(--success)]" />}
          {lost && <XCircle className="size-4 text-muted-foreground" />}
          <h3 className="bee-card-title">
            {won ? t("statusLabel.won") : lost ? t("statusLabel.lost") : t("statusLabel.dismissed")}
          </h3>
          {opportunity.closed_at && (
            <span className="ml-auto bee-micro">
              {formatDate(opportunity.closed_at, locale)}
            </span>
          )}
        </div>
        {lost && (opportunity.loss_reason || opportunity.competitor) && (
          <p className="text-xs text-muted-foreground">
            {opportunity.loss_reason && (
              <>
                {t("reasonPrefix")}{" "}
                {lossReasonLabelsForLocale[opportunity.loss_reason as LossReason] ?? opportunity.loss_reason}
              </>
            )}
            {opportunity.loss_reason && opportunity.competitor && " · "}
            {opportunity.competitor && (
              <>
                {t("competitorPrefix")} {opportunity.competitor}
              </>
            )}
          </p>
        )}
        {won && opportunity.competitor && (
          <p className="text-xs text-muted-foreground">
            {t("competitorBeatenPrefix")} {opportunity.competitor}
          </p>
        )}
      </section>
    );
  }

  function reset() {
    setMode(null);
    setLossReason("");
    setCompetitor("");
    setNotes("");
  }

  function submit(outcome: "won" | "lost") {
    if (outcome === "lost" && !lossReason) return;
    recordOutcome.mutate(
      {
        outcome,
        loss_reason: outcome === "lost" ? (lossReason as LossReason) : undefined,
        competitor: competitor.trim() === "" ? undefined : competitor.trim(),
        notes: notes.trim() === "" ? undefined : notes.trim(),
      },
      { onSuccess: reset },
    );
  }

  return (
    <section className="bee-surface bee-bento-pad">
      <h3 className="bee-card-title">{t("sectionTitle")}</h3>

      {mode === null && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("won")}
            className="bee-btn-ghost flex-1 justify-center"
            style={{ borderColor: "var(--success)", color: "var(--success)" }}
          >
            <CheckCircle2 className="size-3.5" /> {t("markWon")}
          </button>
          <button
            type="button"
            onClick={() => setMode("lost")}
            className="bee-btn-ghost flex-1 justify-center"
          >
            <XCircle className="size-3.5" /> {t("markLost")}
          </button>
        </div>
      )}

      {mode !== null && (
        <div className="space-y-3">
          <Badge variant={mode === "won" ? "success" : "secondary"}>
            {mode === "won" ? t("statusLabel.won") : t("statusLabel.lost")}
          </Badge>

          {mode === "lost" && (
            <label className="block text-xs text-muted-foreground">
              {t("reasonRequiredLabel")}
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value as LossReason)}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
              >
                <option value="">{t("reasonPlaceholder")}</option>
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {lossReasonLabelsForLocale[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs text-muted-foreground">
            {mode === "won" ? t("competitorWonLabel") : t("competitorLostLabel")}
            <input
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder={t("competitorPlaceholder")}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            />
          </label>

          <label className="block text-xs text-muted-foreground">
            {t("notesLabel")}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("notesPlaceholder")}
              className="mt-1 w-full resize-none rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            />
          </label>

          {recordOutcome.isError && (
            <p className="text-xs text-destructive">{t("error")}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit(mode)}
              disabled={recordOutcome.isPending || (mode === "lost" && !lossReason)}
              className="bee-btn bee-btn--primary flex-1"
            >
              {recordOutcome.isPending ? t("saving") : t("confirm")}
            </button>
            <button type="button" onClick={reset} className="bee-btn-ghost">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
