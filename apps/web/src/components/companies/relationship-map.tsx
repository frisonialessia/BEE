"use client";

import { CheckCircle2, Circle, MinusCircle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { TIER_LABELS, type OpportunityLinkStatus, type RelationshipTierGroup } from "@/lib/relationship-map";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<OpportunityLinkStatus, string> = {
  won: "border-[var(--success)] bg-[var(--success)]/10",
  open: "border-[var(--color-chart-4)] bg-[var(--color-chart-4)]/10",
  lost: "border-border bg-[var(--color-primary)]/10 opacity-70",
  dismissed: "border-dashed border-border opacity-70",
  none: "border-dashed border-border",
};

const STATUS_ICON: Record<OpportunityLinkStatus, typeof Circle> = {
  won: CheckCircle2,
  open: Circle,
  lost: XCircle,
  dismissed: MinusCircle,
  none: Circle,
};

/** Mapa de relaciones — el comité de compra de esta cuenta, agrupado por
 *  nivel real (no una jerarquía de reporte inventada: BEE no tiene ese
 *  dato) y coloreado por si ya hay una oportunidad ligada a cada contacto.
 *  Sirve para ver de un vistazo si todo el peso de la cuenta está en una
 *  sola persona o si ya se multi-hiló el comité completo. */
export function RelationshipMap({
  groups,
  onOpenOpportunity,
}: {
  groups: RelationshipTierGroup[];
  onOpenOpportunity: (opportunityId: string) => void;
}) {
  const t = useTranslations("sharedB.relationshipMap");

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("empty")}</p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.tier} className="flex items-start gap-3">
          <p className="w-28 shrink-0 pt-2 bee-eyebrow">
            {TIER_LABELS[group.tier]}
          </p>
          <div className="flex flex-1 flex-wrap gap-2">
            {group.nodes.map((node) => {
              const Icon = STATUS_ICON[node.opportunityStatus];
              const clickable = node.singleOpportunityId !== null;
              return (
                <button
                  key={node.lead.id}
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onOpenOpportunity(node.singleOpportunityId!) : undefined}
                  title={
                    node.opportunityCount > 1
                      ? t("multipleOpportunities", { count: node.opportunityCount })
                      : t(`statusHint.${node.opportunityStatus}`)
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1 text-left text-xs transition-colors",
                    STATUS_STYLE[node.opportunityStatus],
                    clickable ? "cursor-pointer hover:brightness-110" : "cursor-default",
                  )}
                >
                  <Icon className="size-3 shrink-0" />
                  <span className="min-w-0 truncate">
                    {node.lead.full_name}
                    {node.lead.title && <span className="text-muted-foreground"> · {node.lead.title}</span>}
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
