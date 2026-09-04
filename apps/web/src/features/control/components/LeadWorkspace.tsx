"use client";

import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadBoard } from "@/hooks/queries/use-lead-board";
import { useDashboardBase } from "@/lib/demo/mode";
import { KANBAN_COLUMNS, groupLeadCards } from "@/lib/control/lead-board";

/* Five stages, one hue: the bar gets stronger as a lead gets closer to a
   decision — the same indigo the rest of the tab uses for "fine". */
const STAGE_STRENGTH = [30, 45, 65, 85, 100];

/**
 * Pipeline de leads — how many opportunities sit in each stage right now,
 * from just-detected to closed, plus a jump into the CRM to work them. A
 * summary, not a Kanban: the drag-and-drop board is CRM's job. Polls the
 * same opportunities query as the board (12 s).
 */
export function LeadWorkspace() {
  const t = useTranslations("probarNetworkBrandControl.control.leadWorkspace");
  const base = useDashboardBase();
  const { data: result, isLoading } = useLeadBoard(100);
  const cards = result?.cards ?? [];
  const grouped = groupLeadCards(cards);
  const hotCount = cards.filter((c) => c.hot_lead).length;

  return (
    <OverviewCard
      span={4}
      title={t("title")}
      caption={t("caption")}
      action={<LiveBadge live={result?.live !== false} hideLive />}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 rounded-[var(--radius-md)]" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="bee-caption flex flex-1 items-center justify-center py-8 text-center">{t("empty")}</p>
      ) : (
        <>
          <HorizontalFunnel
            rows={KANBAN_COLUMNS.map((col, i) => ({
              label: t(`stages.${col.id}`),
              value: (grouped[col.id] ?? []).length,
              color: STAGE_STRENGTH[i] === 100 ? DATA.indigo : mix(DATA.indigo, STAGE_STRENGTH[i]),
            }))}
          />
          {hotCount > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs">
              <Flame className="size-3.5 text-[var(--color-text)]" aria-hidden />
              {t("hotLeads", { count: hotCount })}
            </p>
          )}
        </>
      )}

      <Link href={`${base}/crm`} className="bee-btn-ghost mt-4 w-full shrink-0 justify-center text-xs">
        {t("openCrm")}
        <ArrowRight className="size-3.5" />
      </Link>
    </OverviewCard>
  );
}
