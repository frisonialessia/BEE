"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useUpdateOpportunity } from "@/hooks/queries/use-opportunities";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MEDDIC_CRITERIA, qualificationScore } from "@/lib/forecast";
import type { Opportunity } from "@/types/domain";

/** Calificación MEDDIC + datos de pronóstico (monto, fecha esperada de
 *  cierre) — editable desde el drawer de oportunidad. Cada cambio se
 *  guarda de inmediato; no hay botón de "guardar" aparte.
 *
 *  Se monta con `key={opportunity.id}` desde el drawer: cambiar de
 *  oportunidad crea una instancia nueva (con su propio estado inicial) en
 *  vez de sincronizar props → estado en un efecto. */
export function QualificationPanel({ opportunity }: { opportunity: Opportunity }) {
  const t = useTranslations("forecastWinLoss.qualification");
  const updateOpportunity = useUpdateOpportunity();

  const [amount, setAmount] = useState(opportunity.amount?.toString() ?? "");
  const [closeDate, setCloseDate] = useState(opportunity.expected_close_date ?? "");
  // Fuente de verdad local para el checklist — igual que amount/closeDate.
  // Si leyéramos de `opportunity.qualification` (prop) en cada toggle,
  // dos clics rápidos antes de que el refetch de la mutación anterior
  // resuelva usarían el mismo valor stale de partida y el PATCH (que
  // reemplaza el dict completo) perdería el primer cambio.
  const [qualification, setQualification] = useState(opportunity.qualification);

  const score = qualificationScore(qualification);
  const confirmedCount = Math.round(score * MEDDIC_CRITERIA.length);

  function toggleCriterion(key: string) {
    const value = !qualification[key];
    setQualification((prev) => ({ ...prev, [key]: value }));
    // Send only the one key that changed — the backend merges it into
    // whatever's currently stored server-side. Sending the whole local dict
    // here would put us back to a full replace: two toggles in flight at once
    // could still race and the one that commits last would win outright,
    // silently dropping the other (see PATCH /opportunities/{id}).
    updateOpportunity.mutate({ id: opportunity.id, body: { qualification: { [key]: value } } });
  }

  function commitAmount() {
    const parsed = amount.trim() === "" ? null : Number(amount);
    if (parsed !== null && Number.isNaN(parsed)) return;
    if (parsed === opportunity.amount) return;
    updateOpportunity.mutate({ id: opportunity.id, body: { amount: parsed } });
  }

  function commitCloseDate(value: string) {
    setCloseDate(value);
    updateOpportunity.mutate({
      id: opportunity.id,
      body: { expected_close_date: value.trim() === "" ? null : value },
    });
  }

  return (
    <section className="bee-surface bee-bento-pad">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="bee-card-title">{t("title")}</h3>
        <span className="font-mono bee-micro">
          {confirmedCount}/{MEDDIC_CRITERIA.length}
        </span>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-primary)]/40">
        <div
          className="h-full rounded-full bg-[var(--color-chart-4)] transition-[width]"
          style={{ width: `${score * 100}%` }}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MEDDIC_CRITERIA.map((c) => {
          const checked = Boolean(qualification[c.key]);
          return (
            <Label
              key={c.key}
              title={t(`meddic.${c.key}.hint`)}
              className="cursor-pointer items-start rounded-[var(--radius-md)] px-2 py-1.5 text-xs font-normal transition-colors hover:bg-[var(--color-primary)]/25"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleCriterion(c.key)}
                className="mt-0.5 shrink-0"
              />
              <span className={checked ? "text-foreground" : "text-muted-foreground"}>{t(`meddic.${c.key}.label`)}</span>
            </Label>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          {t("amountLabel")}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={commitAmount}
            inputMode="decimal"
            placeholder={t("amountPlaceholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("closeDateLabel")}
          <input
            type="date"
            value={closeDate}
            onChange={(e) => commitCloseDate(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
        </label>
      </div>
    </section>
  );
}
