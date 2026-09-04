"use client";

import { Building2, ExternalLink, Mail, Phone, Radio } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { DATA, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import type { Locale } from "@/i18n/locales";
import { getOpportunityStatusLabels, getOpportunityTypeLabels } from "@/lib/format";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import type { UserOut } from "@/types/auth";
import type { BattlecardCompany, BattlecardLead, Company, Lead, Opportunity } from "@/types/domain";

import { countByStep, monthlyAmounts, segmentFill } from "./account-stats";
import { Avatar, Chip, InfoRow, PaneSection } from "./primitives";
import { STEP_ORDER, isClosedStatus, stepOf } from "./stage-meta";

/** Left pane: who (contact), where (company), how much (amount), who owns
 *  it, then the account's opportunities as charts — never prose. */
export function LeftPane({
  opportunity,
  lead,
  fallbackLead,
  company,
  fallbackCompany,
  owner,
  accountOpps,
  hue,
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
  hue: string;
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
  const companyLine = [company?.domain ?? fallbackCompany?.domain, company?.industry ?? fallbackCompany?.industry, company?.country ?? fallbackCompany?.country]
    .filter(Boolean)
    .join(" · ");

  const isClient = accountOpps.some((o) => o.status === "won");
  const isHot = Boolean(opportunity.strategy?.hot_lead);
  const needsReview = Boolean(opportunity.strategy?.manual_review_required);
  const type = opportunity.opportunity_type ?? "new_logo";
  const closed = isClosedStatus(opportunity.status);
  const stageWord = closed ? tStage(`closedStatus.${opportunity.status as "won" | "lost" | "dismissed"}`) : tStage(`stages.${stepOf(opportunity.status)}`);

  const byStep = useMemo(() => countByStep(accountOpps), [accountOpps]);
  const total = accountOpps.length;

  const monthly = useMemo(() => monthlyAmounts(accountOpps, locale), [accountOpps, locale]);
  const hasAmounts = monthly.some((p) => p.value > 0);

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
          <Avatar name={contactName} hue={hue} size={44} photoUrl={opportunity.photo_url} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{contactName ?? t("noContact")}</p>
            {contactTitle && <p className="truncate text-sm text-muted-foreground">{contactTitle}</p>}
          </div>
        </div>
        {(email || phone || linkedin || opportunity.source) && (
          <div className="mt-4 flex flex-col gap-3">
            {email && (
              <InfoRow icon={Mail} hue={hue} label={t("contact.email")}>
                <a href={`mailto:${email}`} className="hover:underline">{email}</a>
              </InfoRow>
            )}
            {phone && (
              <InfoRow icon={Phone} hue={hue} label={t("contact.phone")}>
                <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
              </InfoRow>
            )}
            {linkedin ? (
              <InfoRow icon={ExternalLink} hue={hue} label={t("contact.linkedin")}>
                <a href={linkedin} target="_blank" rel="noreferrer" className="hover:underline">
                  {linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </InfoRow>
            ) : (
              opportunity.source && (
                <InfoRow icon={Radio} hue={hue} label={t("contact.source")}>
                  {tForm.has(`sourceOptions.${opportunity.source}`) ? tForm(`sourceOptions.${opportunity.source}`) : opportunity.source}
                </InfoRow>
              )
            )}
          </div>
        )}
      </PaneSection>

      {/* ── Empresa ──────────────────────────────────────────────────── */}
      <PaneSection>
        <InfoRow icon={Building2} hue={hue} label={t("company")}>
          <span className="font-medium">{companyName ?? t("noCompany")}</span>
          {companyLine && <span className="text-muted-foreground"> · {companyLine}</span>}
        </InfoRow>
      </PaneSection>

      {/* ── Monto — a quiet lavender box; greens belong to the Ventas page ── */}
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3" style={{ background: "var(--color-primary)" }}>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="bee-caption font-medium text-[var(--color-text)]">{stageWord}</p>
          <p className="text-lg font-bold tabular-nums">
            {opportunity.amount != null ? formatMoney(opportunity.amount, "USD", locale) : "—"}
          </p>
          {opportunity.expected_close_date && (
            <p className="bee-caption">{t("expectedClose", { date: formatDate(opportunity.expected_close_date, locale) })}</p>
          )}
        </div>
        {!closed && (
          <button type="button" onClick={onViewAmount} className="bee-btn-ghost !h-8 !text-sm">
            {t("view")}
          </button>
        )}
      </div>

      {/* ── Responsable ──────────────────────────────────────────────── */}
      <PaneSection>
        <div className="flex items-center gap-3">
          <Avatar name={owner?.full_name} hue={hue} size={32} photoUrl={owner?.avatar_url} />
          <div className="min-w-0 leading-tight">
            <p className="bee-caption">{t("owner")}</p>
            <p className="truncate text-sm font-medium">{owner?.full_name ?? tStage("unassigned")}</p>
          </div>
        </div>
      </PaneSection>

      {/* ── Cuenta: oportunidades como gráficos ──────────────────────── */}
      <PaneSection
        className="flex flex-1 flex-col"
        title={t("account.title")}
        aside={
          <div className="flex items-center gap-2">
            <span className="bee-caption">{t("account.score")}</span>
            <ProgressRing value={opportunity.score / 100} size={36} stroke={4} color={hue} label={`${t("account.score")} ${Math.round(opportunity.score)}`} />
          </div>
        }
      >
        <p className="bee-caption mb-1.5">{t("account.byStage", { count: total })}</p>
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("account.byStage", { count: total })}>
          {STEP_ORDER.filter((s) => byStep[s] > 0).map((s) => (
            <span key={s} className="h-full" style={{ width: `${(byStep[s] / Math.max(total, 1)) * 100}%`, background: segmentFill(s, accountOpps) }} />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {STEP_ORDER.filter((s) => byStep[s] > 0).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: segmentFill(s, accountOpps) }} />
              {tStage(`stages.${s}`)} <span className="font-bold tabular-nums text-[var(--color-text)]">{byStep[s]}</span>
            </li>
          ))}
        </ul>

        {hasAmounts && (
          <div className="mt-4 flex flex-1 flex-col">
            <p className="bee-caption mb-1">{t("account.amounts")}</p>
            <BarsVsTarget
              points={monthly}
              minHeight={96}
              formatValue={(v) => formatMoney(v, "USD", locale, true)}
              colorFor={(p) => (p.current ? DATA.honey : mix(DATA.honey, 45))}
            />
          </div>
        )}

        {closed && (
          <p className="bee-caption mt-3">
            {statusLabels[opportunity.status]}
            {opportunity.closed_at && ` · ${formatDate(opportunity.closed_at, locale)}`}
          </p>
        )}
      </PaneSection>

      <p className="bee-caption border-t border-[var(--color-divider)] pt-3">{t("createdOn", { date: formatDate(opportunity.created_at, locale) })}</p>
    </div>
  );
}
