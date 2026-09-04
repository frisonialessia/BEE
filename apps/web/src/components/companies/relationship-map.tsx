"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

import { REST, TONE, tint } from "@/components/charts/palette";
import { TIER_LABELS, type OpportunityLinkStatus, type RelationshipTierGroup } from "@/lib/relationship-map";
import { cn } from "@/lib/utils";

/** One hue for the box (lilac — what BEE has prepared for each person):
 *  a won link at full strength, an open one at 70 %, a lost or dismissed
 *  one in the page grey, no link at all as a dashed outline. */
const STATUS_FILL: Record<OpportunityLinkStatus, string | null> = {
  won: tint(TONE.prepared, 100),
  open: tint(TONE.prepared, 70),
  lost: REST,
  dismissed: REST,
  none: null,
};

/** Mapa de relaciones — el comité de compra de esta cuenta, agrupado por
 *  nivel real (no una jerarquía de reporte inventada: BEE no tiene ese
 *  dato), cada contacto como una píldora cuyo fondo dice si ya hay una
 *  oportunidad ligada. Sirve para ver de un vistazo si todo el peso de la
 *  cuenta está en una sola persona o si ya se multi-hiló el comité. */
export function RelationshipMap({ groups, onOpenOpportunity }: { groups: RelationshipTierGroup[]; onOpenOpportunity: (opportunityId: string) => void }) {
  const t = useTranslations("sharedB.relationshipMap");

  if (groups.length === 0) {
    return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.tier} className="bee-row items-start">
          <p className="bee-caption w-24 shrink-0 pt-1.5 uppercase tracking-wide">{TIER_LABELS[group.tier]}</p>
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {group.nodes.map((node) => {
              const fill = STATUS_FILL[node.opportunityStatus];
              const clickable = node.singleOpportunityId !== null;
              const style: CSSProperties = fill ? { background: fill, borderColor: fill } : {};
              return (
                <button
                  key={node.lead.id}
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onOpenOpportunity(node.singleOpportunityId!) : undefined}
                  title={node.opportunityCount > 1 ? t("multipleOpportunities", { count: node.opportunityCount }) : t(`statusHint.${node.opportunityStatus}`)}
                  className={cn(
                    "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-left text-xs text-[var(--color-text)] transition-[filter]",
                    fill ? "border-transparent" : "border-dashed border-[var(--color-divider)]",
                    clickable ? "cursor-pointer hover:brightness-95" : "cursor-default",
                  )}
                  style={style}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{node.lead.full_name}</span>
                    {node.lead.title && <span className="text-[var(--color-text-muted)]"> · {node.lead.title}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
