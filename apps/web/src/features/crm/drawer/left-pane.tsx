"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { getOpportunityStatusLabels, getOpportunityTypeLabels } from "@/lib/format";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import type { UserOut } from "@/types/auth";
import type { BattlecardCompany, BattlecardLead, Company, Lead, Opportunity } from "@/types/domain";

import { countByStep, segmentFill } from "./account-stats";
import { Avatar, Chip, FactRow, PaneSection, PersonPill, PriorityDots } from "./primitives";
import { STEP_ORDER, isClosedStatus, stepOf } from "./stage-meta";

/** Left pane: who (contact), where (company), how much (amount), who owns
 *  it, the priority as the dot row, then the account's pipeline as one
 *  compact funnel — facts as label/value rows with hairlines, no boxes. */
export function LeftPane({
  opportunity,
  lead,
  fallbackLead,
  company,
  fallbackCompany,
  owner,
  accountOpps,
  onViewAmount,
}: {
  opportunity: Opportunity;
  lead: Lead | null;
  fallbackLead: BattlecardLead | null;
  company: Company | null;
  fallbackCompany: BattlecardCompany | null;
  owner: UserOut | null;
  /** Every opportunity of the same account, this one included. */
  accountOpps: Opportunity[];
  onViewAmount: () => void;
}) {
  const t = useTranslations("crm.drawer");
  const tStage = useTranslations("crm.board");
  const tForm = useTranslations("crm.form");
  const locale = useLocale() as Locale;
  const typeLabels = getOpportunityTypeLabels(locale);
  const statusLabels = getOpportunityStatusLabels(locale);

  const contactName = lead?.full_name ?? fallbackLead?.full_name ?? null;
  const contactTitle = lead?.title ?? fallbackLead?.title ?? null;
  const email = lead?.email ?? fallbackLead?.email ?? null;
  const phone = lead?.phone ?? null;
  const linkedin = lead?.linkedin_url ?? fallbackLead?.linkedin_url ?? null;
  const companyName = company?.name ?? fallbackCompany?.name ?? null;
  const domain = company?.domain ?? fallbackCompany?.domain ?? null;
  const industry = company?.industry ?? fallbackCompany?.industry ?? null;
  const country = company?.country ?? fallbackCompany?.country ?? null;

  const isClient = accountOpps.some((o) => o.status === "won");
  const isHot = Boolean(opportunity.strategy?.hot_lead);
  const needsReview = Boolean(opportunity.strategy?.manual_review_required);
  const type = opportunity.opportunity_type ?? "new_logo";
  const closed = isClosedStatus(opportunity.status);
  const stageWord = closed ? tStage(`closedStatus.${opportunity.status as "won" | "lost" | "dismissed"}`) : tStage(`stages.${stepOf(opportunity.status)}`);

  const byStep = useMemo(() => countByStep(accountOpps), [accountOpps]);
  const funnelRows = STEP_ORDER.map((s) => ({ label: tStage(`stages.${s}`), value: byStep[s], color: segmentFill(s, accountOpps) }));

  return (
    <div className="flex min-h-full flex-col gap-5">
      {(isHot || isClient || needsReview || type !== "new_logo") && (
        <div className="flex flex-wrap gap-1.5">
          {isHot && !closed && <Chip hue={DATA.honeyFill}>{t("tags.hot")}</Chip>}
          {isClient && <Chip hue={DATA.lavender}>{t("tags.client")}</Chip>}
          {type !== "new_logo" && <Chip hue={DATA.lavender}>{typeLabels[type]}</Chip>}
          {needsReview && !closed && <Chip hue={DATA.lavender}>{t("tags.review")}</Chip>}
        </div>
      )}

      {/* ── Contacto ─────────────────────────────────────────────────── */}
      <PaneSection>
        <div className="flex items-center gap-3">
          <Avatar name={contactName} size={44} photoUrl={opportunity.photo_url} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{contactName ?? t("noContact")}</p>
            {contactTitle && <p className="truncate text-sm text-muted-foreground">{contactTitle}</p>}
          </div>
        </div>
        {(email || phone || linkedin || opportunity.source) && (
          <dl className="mt-3">
            {email && (
              <FactRow label={t("contact.email")}>
                <a href={`mailto:${email}`} className="hover:underline">{email}</a>
              </FactRow>
            )}
            {phone && (
              <FactRow label={t("contact.phone")}>
                <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
              </FactRow>
            )}
            {linkedin && (
              <FactRow label={t("contact.linkedin")}>
                <a href={linkedin} target="_blank" rel="noreferrer" className="hover:underline">
                  {linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </FactRow>
            )}
            {opportunity.source && (
              <FactRow label={t("contact.source")}>
                {tForm.has(`sourceOptions.${opportunity.source}`) ? tForm(`sourceOptions.${opportunity.source}`) : opportunity.source}
              </FactRow>
            )}
          </dl>
        )}
      </PaneSection>

      {/* ── Empresa ──────────────────────────────────────────────────── */}
      <PaneSection>
        <dl>
          <FactRow label={t("company")}>
            <span className="font-medium">{companyName ?? t("noCompany")}</span>
          </FactRow>
          {domain && <FactRow label={tForm("companyWebsite")}>{domain}</FactRow>}
          {industry && <FactRow label={tForm("companyIndustry")}>{industry}</FactRow>}
          {country && <FactRow label={t("companyCountry")}>{country}</FactRow>}
        </dl>
      </PaneSection>

      {/* ── Monto — a plain large figure, the stage and the close date beside it ── */}
      <PaneSection>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 leading-tight">
            <p className="bee-caption">
              {t("amount")} · {stageWord}
            </p>
            <p className="bee-kpi mt-1">{opportunity.amount != null ? formatMoney(opportunity.amount, "USD", locale) : "—"}</p>
            <p className="bee-caption mt-1">
              {opportunity.expected_close_date ? t("expectedClose", { date: formatDate(opportunity.expected_close_date, locale) }) : t("noCloseDate")}
            </p>
          </div>
          {!closed && (
            <button type="button" onClick={onViewAmount} className="bee-btn-ghost !h-8 shrink-0 !text-sm">
              {t("view")}
            </button>
          )}
        </div>
        {closed && (
          <p className="bee-caption mt-2">
            {statusLabels[opportunity.status]}
            {opportunity.closed_at && ` · ${formatDate(opportunity.closed_at, locale)}`}
          </p>
        )}
      </PaneSection>

      {/* ── Responsable · Prioridad ──────────────────────────────────── */}
      <PaneSection>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 leading-tight">
            <p className="bee-caption mb-1.5">{t("owner")}</p>
            {owner ? <PersonPill name={owner.full_name} photoUrl={owner.avatar_url} /> : <p className="text-sm text-muted-foreground">{tStage("unassigned")}</p>}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="bee-caption mb-1.5">{tForm("priority")}</p>
            <div className="flex h-7 items-center gap-3">
              <PriorityDots score={opportunity.score} size={20} />
              <span className="bee-caption tabular-nums">{t("account.score")} {Math.round(opportunity.score)}</span>
            </div>
          </div>
        </div>
      </PaneSection>

      {/* ── Cuenta: the account's opportunities per stage ───────────── */}
      <PaneSection className="flex flex-1 flex-col" title={t("account.title")} aside={<span className="bee-caption">{t("account.byStage", { count: accountOpps.length })}</span>}>
        <HorizontalFunnel rows={funnelRows} />
      </PaneSection>

      <p className="bee-caption border-t border-[var(--color-divider)] pt-3">{t("createdOn", { date: formatDate(opportunity.created_at, locale) })}</p>
    </div>
  );
}
