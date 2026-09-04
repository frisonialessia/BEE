"use client";

import { useTranslations } from "next-intl";

import { AreaChart } from "@/components/charts/area-chart";
import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { Donut } from "@/components/charts/donut";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { StageTiles } from "@/components/charts/stage-tiles";
import { MarketingHoneycomb } from "@/components/marketing-honeycomb";

/**
 * FeatureChart — the illustrative chart on the right of each band in
 * /funcionalidades, drawn with the dashboard's own chart components so the
 * page shows the product's real marks, not a mock. One client component
 * for all seven because the charts take function props (formatValue,
 * colorFor) that a server page cannot hand to a client component; the
 * page only passes the band id.
 *
 * Data is fixed demo data (labelled "datos de ejemplo" in each card) —
 * never a real account. Greens appear ONLY in the Ventas chart, the same
 * rule the dashboard follows; every other band wears its own single hue.
 */

export type FeatureId = "senales" | "crm" | "estrategias" | "pronostico" | "ventas" | "calendario" | "control";

/** Band hue by id — indigo → honey → lilac → magenta (greens stay on the Ventas page). */
export const FEATURE_HUE: Record<FeatureId, string> = {
  senales: DATA.indigo,
  crm: DATA.honey,
  estrategias: DATA.violet,
  pronostico: DATA.magenta,
  ventas: DATA.honey,
  calendario: DATA.indigo,
  control: DATA.honey,
};

const MONTH_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6"] as const;

export function FeatureChart({ id }: { id: FeatureId }) {
  const t = useTranslations(`legalMarketing.funcionalidades.sections.${id}.chart`);
  const tMonths = useTranslations("legalMarketing.funcionalidades.months");
  const months = MONTH_KEYS.map((k) => tMonths(k));
  const hue = FEATURE_HUE[id];

  switch (id) {
    case "senales":
      return (
        <div className="flex h-full items-center justify-center">
          <MarketingHoneycomb />
        </div>
      );
    case "crm":
      return (
        <div className="flex h-full flex-col justify-center">
          <HorizontalFunnel
            rows={[
              { label: t("new"), value: 24, color: hue },
              { label: t("qualified"), value: 15, color: hue },
              { label: t("proposal"), value: 8, color: hue },
              { label: t("closing"), value: 4, color: hue },
            ]}
          />
        </div>
      );
    case "estrategias":
      return (
        <div className="flex h-full flex-col justify-center">
          <Donut
            slices={[
              { label: t("email"), value: 45, color: hue },
              { label: t("linkedin"), value: 35, color: mix(hue, 60) },
              { label: t("call"), value: 20, color: mix(hue, 30) },
            ]}
            size={120}
            centerLabel="100%"
          />
        </div>
      );
    case "pronostico":
      return (
        <div className="flex h-full flex-col">
          <AreaChart
            points={[12, 14, 17, 19, 23, 26].map((value, i) => ({ label: months[i], value }))}
            color={hue}
            minHeight={160}
            formatValue={(v) => `${Math.round(v)} ${t("unit")}`}
          />
        </div>
      );
    case "ventas":
      return (
        <div className="flex h-full flex-col">
          <BarsVsTarget
            points={[32, 38, 41, 45, 52, 58].map((value, i) => ({ label: months[i], value, current: i === 5 }))}
            target={50}
            minHeight={160}
            formatValue={(v) => `${Math.round(v)} k`}
            colorFor={(p) => (p.value >= 50 ? DATA.honey : mix(DATA.honey, 45))}
          />
        </div>
      );
    case "calendario":
      return (
        <div className="flex h-full flex-col justify-center gap-4">
          <StageTiles
            tiles={[
              { label: t("today"), value: "3", color: hue },
              { label: t("week"), value: "11", color: mix(hue, 60) },
              { label: t("overdue"), value: "0", color: mix(hue, 30) },
            ]}
          />
          <div className="flex items-center gap-3">
            <ProgressRing value={0.64} size={44} stroke={5} color={hue} label={`64% ${t("weekDone")}`} />
            <p className="bee-caption text-xs">{t("weekDone")}</p>
          </div>
        </div>
      );
    case "control":
      return (
        <div className="flex h-full flex-col justify-center gap-4">
          <div className="flex items-center gap-4">
            <ProgressRing value={0.94} size={96} stroke={8} color={hue} label={`94% ${t("confidence")}`} />
            <p className="bee-caption text-xs">{t("confidence")}</p>
          </div>
          <StageTiles
            tiles={[
              { label: t("queue"), value: "3", color: hue },
              { label: t("facts"), value: "128", color: mix(hue, 60) },
              { label: t("errors"), value: "0", color: mix(hue, 30) },
            ]}
          />
        </div>
      );
  }
}
