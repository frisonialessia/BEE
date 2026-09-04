"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { HIVE_RAMP, TONE, tint } from "@/components/charts/palette";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { HIVE_STAGES, IntentHive, STAGE_STEP, stageOf, type HiveStage } from "@/features/signals/intent-hive";
import { useHiveLeads } from "@/hooks/queries/use-lead-board";
import { ingestDarkFunnelSignal } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Signal } from "@/types/domain";

const INTENT_TYPES = ["pricing_view", "competitor_compare", "review_visit", "demo_watch", "product_trial", "case_study_view", "content_read", "job_posting", "search", "repeat_visit"] as const;

/**
 * "Intención" — the Dark Funnel as a tab of Señales: the hive in detail
 * (a stage pill above the comb filters it) with "Simular señal" opening
 * in place under it, and beside it when the market arrives — the day ×
 * hour pattern of `detected_at`. Mounted in signals-dashboard.tsx as
 *   { value: "intent", content: <DarkFunnelTab signals={signals} /> }
 * so /dashboard/dark-funnel's redirect to ?tab=intent lands here.
 */
export function DarkFunnelTab({ signals }: { signals: Signal[] }) {
  const t = useTranslations("signalsStrategies.darkFunnel");
  const tHive = useTranslations("shared.intentHive");
  const queryClient = useQueryClient();
  const { data: hiveResult } = useHiveLeads(200);
  const [stage, setStage] = useState<HiveStage | null>(null);

  const [showSimulate, setShowSimulate] = useState(false);
  const [simDomain, setSimDomain] = useState("");
  const [simSignalType, setSimSignalType] = useState<(typeof INTENT_TYPES)[number]>("pricing_view");
  const [simKeywords, setSimKeywords] = useState("");
  const [simLoading, setSimLoading] = useState(false);

  const counts = useMemo(() => {
    const c: Record<HiveStage, number> = { ready_to_buy: 0, decision: 0, consideration: 0, awareness: 0 };
    for (const l of hiveResult?.data ?? []) c[stageOf(l)] += 1;
    return c;
  }, [hiveResult]);
  const total = HIVE_STAGES.reduce((s, k) => s + counts[k], 0);

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    if (!simDomain.trim()) return;
    setSimLoading(true);
    try {
      await ingestDarkFunnelSignal({
        company_domain: simDomain.trim(),
        signal_type: simSignalType,
        intent_keywords: simKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      // The hive reads the same leads — refetch so the new cell shows up.
      await queryClient.invalidateQueries({ queryKey: queryKeys.control.all });
      setSimDomain("");
      setSimKeywords("");
      setShowSimulate(false);
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div className="bee-overview">
      <OverviewCard span={8} title={t("hive.title")} caption={t("hive.caption")} className="lg:min-h-[34rem]!" action={<CardLink onClick={() => setShowSimulate((v) => !v)}>{t("hive.simulate")}</CardLink>}>
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t("hive.stageFilterAria")}>
          <Pill pressed={stage === null} fill={TONE.calm} onClick={() => setStage(null)}>
            {t("stageAll")} <span className="ml-1 tabular-nums opacity-70">{total}</span>
          </Pill>
          {HIVE_STAGES.map((s) => (
            <Pill key={s} pressed={stage === s} fill={HIVE_RAMP[STAGE_STEP[s]]} onClick={() => setStage(stage === s ? null : s)}>
              {tHive(`stages.${s}`)} <span className="ml-1 tabular-nums opacity-70">{counts[s]}</span>
            </Pill>
          ))}
        </div>

        <IntentHive maxRadius={34} minHeight={360} stage={stage} showStages={false} />

        {showSimulate && (
          <form onSubmit={handleSimulate} className="mt-4 flex flex-col gap-4 border-t border-[var(--color-divider)] pt-4">
            <p className="bee-card-title !mb-0">{t("simulateFormTitle")}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("simulate.domain")} required>
                <input value={simDomain} onChange={(e) => setSimDomain(e.target.value)} placeholder={t("domainPlaceholder")} className="bee-input" required />
              </Field>
              <Field label={t("simulate.keywords")}>
                <input value={simKeywords} onChange={(e) => setSimKeywords(e.target.value)} placeholder={t("keywordsPlaceholder")} className="bee-input" />
              </Field>
            </div>
            <div>
              <p className="bee-caption mb-1">{t("simulate.type")}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("simulate.type")}>
                {INTENT_TYPES.map((type) => (
                  <Pill key={type} pressed={simSignalType === type} fill={tint(TONE.market, 45)} onClick={() => setSimSignalType(type)}>
                    {t(`intentTypes.${type}`)}
                  </Pill>
                ))}
              </div>
            </div>
            <p className="bee-micro">{t("simulate.help")}</p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowSimulate(false)} className="bee-btn-ghost">
                {t("simulate.cancel")}
              </button>
              <button type="submit" disabled={simLoading} className="bee-btn bee-btn--primary">
                {simLoading ? t("submitting") : t("submit")}
              </button>
            </div>
          </form>
        )}
      </OverviewCard>

      <OverviewCard span={4} title={t("activity.title")} caption={t("activity.caption")} className="lg:min-h-[34rem]!">
        <SignalActivityHeatmap signals={signals} />
      </OverviewCard>
    </div>
  );
}
