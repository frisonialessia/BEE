"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { runRevenueSimulation } from "@/lib/api";
import { CHART_PALETTE } from "@/lib/brand/colors";
import type { RevenueSimulation, SimulatorScenario } from "@/lib/types";

const SIGNAL_TYPE_VALUES = [
  "funding_round",
  "hiring",
  "leadership_change",
  "tech_adoption",
  "product_launch",
  "expansion",
] as const;

const SCENARIO_BAR: Record<string, string> = {
  Conservative: "bee-bar--3",
  Realistic: "bee-bar--4",
  Optimistic: "bee-bar--1",
};

function ScenarioBar({
  scenario,
  maxDeals,
}: {
  scenario: SimulatorScenario;
  maxDeals: number;
}) {
  const t = useTranslations("shared.revenueSimulator");
  const pct =
    maxDeals > 0 ? Math.round((scenario.projected_won_deals / maxDeals) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="w-24 text-muted-foreground">{scenario.label}</span>
        <span className="font-semibold">
          {scenario.projected_won_deals} {t("deals")}
        </span>
        {scenario.uplift_vs_baseline > 0 && (
          <span className="bee-micro">
            +{scenario.uplift_vs_baseline} {t("vsBaseline")}
          </span>
        )}
      </div>
      <div className="bee-bar-track">
        <div
          className={`bee-bar ${SCENARIO_BAR[scenario.label] ?? "bee-bar--2"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RevenueSimulatorWidget() {
  const t = useTranslations("shared.revenueSimulator");
  const [signalType, setSignalType] = useState("funding_round");
  const [industry, setIndustry] = useState("");
  const [factor, setFactor] = useState(2);
  const [result, setResult] = useState<RevenueSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await runRevenueSimulation({
        signal_type: signalType,
        industry: industry || undefined,
        increase_factor: factor,
      });
      if (res.live && res.data) {
        setResult(res.data);
      } else {
        setError(t("errors.offline"));
      }
    } catch {
      setError(t("errors.failed"));
    } finally {
      setLoading(false);
    }
  }

  const maxDeals = result
    ? Math.max(...result.scenarios.map((s) => s.projected_won_deals), 1)
    : 1;
  const realistic = result?.scenarios.find((s) => s.label === "Realistic");

  return (
    <div className="bee-bento bee-bento--warm bee-bento-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="bee-card-title flex items-center gap-1.5">
            <BarChart3 className="size-4 stroke-[1.25]" style={{ color: CHART_PALETTE[3] }} />
            {t("heading")}
          </h3>
          <p className="bee-caption mt-0.5">
            {t("caption")}
          </p>
        </div>
        {result && (
          <span className="bee-eyebrow">{t(`confidence.${result.data_confidence}`)}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="bee-kpi-tile__label">{t("form.signal")}</label>
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value)}
            className="bee-input"
          >
            {SIGNAL_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`signalTypes.${value}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="bee-kpi-tile__label">{t("form.industry")}</label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder={t("form.industryPlaceholder")}
            className="bee-input"
          />
        </div>

        <div className="space-y-1">
          <label className="bee-kpi-tile__label">{t("form.multiplier", { factor })}</label>
          <input
            type="range"
            min={1.5}
            max={5}
            step={0.5}
            value={factor}
            onChange={(e) => setFactor(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-chart-4)]"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={loading}
        className="bee-btn bee-btn--primary w-full"
      >
        {loading ? t("running") : t("runButton", { factor })}
      </button>

      {error && (
        <div className="flex items-center gap-2 border border-border bg-background px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="bee-bento bee-bento--primary bee-bento-pad space-y-2">
            <div className="flex items-center justify-between">
              <span className="bee-kpi-tile__label">{t("realisticProjection")}</span>
              <span className="bee-kpi">
                {realistic?.projected_won_deals ?? 0}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {t("deals")}
                </span>
              </span>
            </div>
            <p className="text-xs leading-relaxed">{result.recommendation}</p>
            {result.top_playbook && (
              <div className="flex items-center gap-2 bee-micro">
                <TrendingUp className="size-3" style={{ color: CHART_PALETTE[4] }} />
                {t("topPlaybook")} <span className="text-foreground">{result.top_playbook}</span>
                {result.top_channel && (
                  <>
                    {" "}
                    {t("via")} <span className="text-foreground">{result.top_channel}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {result.scenarios.map((s) => (
              <ScenarioBar key={s.label} scenario={s} maxDeals={maxDeals} />
            ))}
          </div>

          <div className="bee-stat-grid">
            <div className="bee-stat">
              <div className="bee-stat__val">
                {Math.round(result.historical_win_rate * 100)}%
              </div>
              <div className="bee-stat__lbl">{t("stats.winRate")}</div>
            </div>
            <div className="bee-stat">
              <div className="bee-stat__val">{result.current_pipeline_count}</div>
              <div className="bee-stat__lbl">{t("stats.pipeline")}</div>
            </div>
            <div className="bee-stat">
              <div className="bee-stat__val">{result.sample_size}</div>
              <div className="bee-stat__lbl">{t("stats.dataPoints")}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 bee-micro hover:text-foreground"
          >
            {showDetails ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {showDetails ? t("methodology.hide") : t("methodology.show")}
          </button>
          {showDetails && (
            <p className="bee-micro leading-relaxed">
              {result.disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
