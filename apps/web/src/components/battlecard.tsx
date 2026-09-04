"use client";

import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  Mail,
  Phone,
  Radio,
  ShieldCheck,
  User,
  Zap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { formatChannel, formatGenerator, formatNextBestAction, formatPlaybook, getOpportunityTypeLabels, getSignalTypeLabels, getUrgencyLabels, opportunityTypeVariant, scoreVariant, stripOpportunityTitlePrefix } from "@/lib/format";
import type { Battlecard } from "@/lib/types";
import { cn } from "@/lib/utils";

/** CEO Battlecard — full synthesized brief in Bento editorial layout. */
export function BattlecardView({ card }: { card: Battlecard }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("shared.battlecard");
  const { strategy, company, lead, signal } = card;
  const urgency = strategy.timing_window.urgency;
  const signalTypeLabels = getSignalTypeLabels(locale);
  const urgencyLabels = getUrgencyLabels(locale);
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const opportunityType = card.opportunity_type ?? "new_logo";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={scoreVariant(card.score)}>{Math.round(card.score)}</Badge>
            {card.ready_to_action && (
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="size-3" />
                {t("badges.readyToAction")}
              </Badge>
            )}
            {card.hot_lead && <Badge variant="warning">{t("badges.hotLead")}</Badge>}
            {card.manual_review_required && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="size-3" />
                {t("badges.reviewRequired")}
              </Badge>
            )}
            <Badge variant="outline">
              {signalTypeLabels[signal.signal_type as keyof typeof signalTypeLabels] ??
                signal.signal_type}
            </Badge>
            {opportunityType !== "new_logo" && (
              <Badge variant={opportunityTypeVariant(opportunityType)}>
                {opportunityTypeLabels[opportunityType]}
              </Badge>
            )}
          </div>
          <h2 className="text-base font-semibold leading-snug">
            {stripOpportunityTitlePrefix(card.title)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("signalDetected", { time: formatRelativeTime(signal.detected_at, locale) })}{" "}
            <span className="font-medium">{formatGenerator(strategy.generator, locale)}</span>
            {strategy.confidence_score !== undefined && (
              <span className="ml-2">
                · {t("confidencePct", { pct: Math.round(strategy.confidence_score * 100) })}
              </span>
            )}
          </p>
          {card.manual_review_required && (
            <div className="mt-2 flex items-start gap-2 border border-border bg-background px-3 py-2 text-xs">
              <AlertTriangle className="mt-1 size-3 shrink-0" />
              <span>{t("manualReviewNotice")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="border border-dashed border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Building2 className="size-3 stroke-[1.25]" />
            {t("sections.company")}
          </div>
          <p className="font-semibold">{company.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{company.domain}</p>
          {company.industry && (
            <p className="text-xs text-muted-foreground">{company.industry}</p>
          )}
        </div>
        <div className="border border-dashed border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <User className="size-3 stroke-[1.25]" />
            {t("sections.lead")}
          </div>
          <p className="font-semibold">{lead.full_name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{lead.title}</p>
          <div className="mt-2 flex gap-2">
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="text-muted-foreground hover:text-foreground"
                title={lead.email}
              >
                <Mail className="size-3.5 stroke-[1.25]" />
              </a>
            )}
            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
                title="LinkedIn"
              >
                <ExternalLink className="size-3.5 stroke-[1.25]" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="border border-border bg-background p-4">
        <h3 className="flex items-center gap-2 bee-card-title">
          <AlertCircle className="size-4 stroke-[1.25]" style={{ color: "var(--color-chart-1)" }} />
          {t("sections.painPoint")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed">{strategy.pain_point}</p>
      </div>

      <div className="bee-bento bee-outline--blue p-4">
        <h3 className="flex items-center gap-2 bee-card-title">
          <Zap className="size-4 stroke-[1.25]" style={{ color: "var(--color-chart-4)" }} />
          {t("sections.closingArgument")}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {t("via", { value: formatChannel(strategy.channel, locale) })}
          </span>
        </h3>
        <blockquote className="mt-2 border-l-2 border-[var(--color-chart-4)] pl-3 text-sm italic leading-relaxed">
          {strategy.closing_argument}
        </blockquote>
      </div>

      <div className="border border-border bg-background p-4">
        <h3 className="flex items-center gap-2 bee-card-title">
          <Clock className="size-4 stroke-[1.25]" />
          {t("sections.timingWindow")}
          <span
            className={cn(
              "ml-auto text-xs font-medium",
              urgency === "immediate" && "text-[var(--color-chart-2)]",
              urgency === "this_week" && "text-[var(--color-chart-1)]",
              (urgency === "this_month" || urgency === "watch") && "text-muted-foreground"
            )}
          >
            {urgencyLabels[urgency]}
          </span>
        </h3>
        <p className="mt-2 text-sm leading-relaxed">{strategy.timing_window.reason}</p>
        {strategy.timing_window.expires_at && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="size-3 stroke-[1.25]" />
            {t("expires", { date: strategy.timing_window.expires_at })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <span className="inline-flex items-center gap-2 border border-border bg-background px-3 py-2 text-xs font-medium">
          {strategy.next_best_action === "reach_out" ? (
            <Phone className="size-3 stroke-[1.25]" />
          ) : (
            <Radio className="size-3 stroke-[1.25]" />
          )}
          {formatNextBestAction(strategy.next_best_action, locale)}
        </span>
        <span className="inline-flex items-center gap-2 border border-border bg-primary px-3 py-2 text-xs">
          {formatChannel(strategy.channel, locale)}
        </span>
        <span className="inline-flex items-center gap-2 border border-border bg-primary px-3 py-2 text-xs">
          {formatPlaybook(strategy.playbook, locale)}
        </span>
        <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Bot className="size-3 stroke-[1.25]" />
          {formatGenerator(strategy.generator, locale)} v{strategy.generator_version}
        </span>
      </div>
    </div>
  );
}
