"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { useStrategyReasoning } from "@/hooks/queries/use-audit";
import type { Battlecard } from "@/lib/types";

function confidenceVariant(score: number): "outline" | "warning" | "success" {
  if (score >= 0.75) return "success";
  if (score >= 0.5) return "warning";
  return "outline";
}

/**
 * WhyThisStrategyPanel — explains a generated strategy's own confidence
 * score instead of leaving it as a bare inline percentage (BattlecardView's
 * only prior treatment of it). Two backend fields fed this that had no
 * frontend reader before: `strategy.rationale` (previously only ever
 * rendered truncated, as a 2-line subtitle on OpportunityCard) and
 * `variant_id`/`variant_arm` (A/B generator attribution, never rendered
 * anywhere). It also cross-references AuditTrailService's per-decision
 * `strategy_reasoning` narrative for this opportunity when one was
 * recorded — today only ever surfaced buried inside OpportunityTimeline's
 * generic multi-agent history log, mixed with every other agent's actions.
 *
 * Renders nothing when there is genuinely nothing to add beyond what
 * BattlecardView already shows (no rationale, no audit match, no variant,
 * not flagged for review) — a confidence badge alone isn't worth a panel.
 */
export function WhyThisStrategyPanel({
  card,
  opportunityId,
}: {
  card: Battlecard;
  opportunityId: string;
}) {
  const t = useTranslations("shared.whyThisStrategy");
  const { strategy } = card;
  const { data: auditResult } = useStrategyReasoning(opportunityId);
  const auditEntry = auditResult?.data ?? null;

  const hasRationale = Boolean(strategy.rationale);
  const hasAuditReasoning = Boolean(auditEntry?.strategy_reasoning);
  const hasVariant = Boolean(strategy.variant_id);

  if (!hasRationale && !hasAuditReasoning && !hasVariant && !card.manual_review_required) {
    return null;
  }

  return (
    <section className="bee-surface bee-bento-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 bee-card-title">
          <Info className="size-4 text-muted-foreground" />
          {t("heading")}
        </h3>
        <Badge variant={confidenceVariant(strategy.confidence_score)}>
          {t("confidencePct", { pct: Math.round(strategy.confidence_score * 100) })}
        </Badge>
      </div>

      {card.manual_review_required && (
        <div className="flex items-start gap-1.5 border border-border bg-background px-2.5 py-1.5 text-xs">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>{t("manualReviewExplainer")}</span>
        </div>
      )}

      {hasRationale && <p className="text-sm leading-relaxed">{strategy.rationale}</p>}

      {hasAuditReasoning && (
        <div className="border-l-2 border-[var(--color-chart-4)] pl-3">
          <p className="bee-caption font-medium">{t("generatorReasoning")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{auditEntry?.strategy_reasoning}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline">
          {strategy.generator} v{strategy.generator_version}
        </Badge>
        {hasVariant && (
          <Badge variant="outline">
            {t("variant", { arm: strategy.variant_arm ?? strategy.variant_id ?? "" })}
          </Badge>
        )}
      </div>
    </section>
  );
}
