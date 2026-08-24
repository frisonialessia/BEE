"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useRecordOutcome } from "@/hooks/mutations/use-record-outcome";
import { lossReasonLabels } from "@/lib/format";
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
      <section className="bee-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          {won && <CheckCircle2 className="size-4 text-[var(--success)]" />}
          {lost && <XCircle className="size-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold">
            {won ? "Ganada" : lost ? "Perdida" : "Descartada"}
          </h3>
          {opportunity.closed_at && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              {new Date(opportunity.closed_at).toLocaleDateString()}
            </span>
          )}
        </div>
        {lost && (opportunity.loss_reason || opportunity.competitor) && (
          <p className="text-xs text-muted-foreground">
            {opportunity.loss_reason && (
              <>Razón: {lossReasonLabels[opportunity.loss_reason as LossReason] ?? opportunity.loss_reason}</>
            )}
            {opportunity.loss_reason && opportunity.competitor && " · "}
            {opportunity.competitor && <>Competidor: {opportunity.competitor}</>}
          </p>
        )}
        {won && opportunity.competitor && (
          <p className="text-xs text-muted-foreground">Competidor superado: {opportunity.competitor}</p>
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
    <section className="bee-surface p-5">
      <h3 className="mb-3 text-sm font-semibold">Registrar resultado</h3>

      {mode === null && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("won")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-[var(--success)]/10 px-3 py-2 text-xs font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/20"
          >
            <CheckCircle2 className="size-3.5" /> Marcar ganada
          </button>
          <button
            type="button"
            onClick={() => setMode("lost")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--color-primary)]/25"
          >
            <XCircle className="size-3.5" /> Marcar perdida
          </button>
        </div>
      )}

      {mode !== null && (
        <div className="space-y-3">
          <Badge variant={mode === "won" ? "success" : "secondary"}>
            {mode === "won" ? "Ganada" : "Perdida"}
          </Badge>

          {mode === "lost" && (
            <label className="block text-xs text-muted-foreground">
              Razón (obligatoria)
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value as LossReason)}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
              >
                <option value="">Selecciona una razón…</option>
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {lossReasonLabels[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs text-muted-foreground">
            {mode === "won" ? "Competidor superado (opcional)" : "Competidor que ganó (opcional)"}
            <input
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder="Nombre del competidor"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            />
          </label>

          <label className="block text-xs text-muted-foreground">
            Notas (opcional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexto adicional del cierre…"
              className="mt-1 w-full resize-none rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            />
          </label>

          {recordOutcome.isError && (
            <p className="text-xs text-destructive">No se pudo registrar — intenta de nuevo.</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit(mode)}
              disabled={recordOutcome.isPending || (mode === "lost" && !lossReason)}
              className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-chart-4)] px-3 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-50"
            >
              {recordOutcome.isPending ? "Guardando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
