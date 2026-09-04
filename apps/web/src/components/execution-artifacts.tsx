"use client";

import { formatGenerator } from "@/lib/format";

import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Mail,
  ListChecks,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locales";

import type { ArtifactBundle, ActionItem } from "@/lib/types";

interface ExecutionArtifactsProps {
  bundle: ArtifactBundle;
  opportunityId: string;
}

const priorityColors: Record<ActionItem["priority"], string> = {
  high: "border-[var(--color-chart-2)]",
  medium: "border-[var(--warning)]",
  low: "border-border",
};

function CopyButton({ text }: { text: string }) {
  const t = useTranslations("shared.executionArtifacts.copyButton");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? t("copied") : t("copy")}
    </button>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--bee-card-border)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-card)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="text-xs bg-[color-mix(in_srgb,var(--color-chart-6)_20%,var(--color-background))] text-[var(--color-text)] px-2 py-1 rounded-sm font-medium">
              {badge}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export function ExecutionArtifacts({ bundle }: ExecutionArtifactsProps) {
  const t = useTranslations("shared.executionArtifacts");
  const locale = useLocale() as Locale;
  const { email_draft, meeting_structure, next_steps } = bundle;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-[var(--color-text)]" />
        <h3 className="bee-card-title">
          {t("heading")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("generatedBy", { generator: formatGenerator(bundle.generator, locale) })}
        </span>
      </div>

      {/* Email Draft */}
      <CollapsibleSection
        title={t("emailDraft.title")}
        icon={Mail}
        defaultOpen={true}
        badge={t("emailDraft.badge")}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("emailDraft.subject")}</p>
              <p className="text-sm font-medium text-foreground">{email_draft.subject}</p>
            </div>
            <CopyButton text={email_draft.subject} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">{t("emailDraft.body")}</p>
              <CopyButton
                text={
                  email_draft.body +
                  (email_draft.ps_line ? `\n\n${email_draft.ps_line}` : "")
                }
              />
            </div>
            <pre className="text-sm text-foreground bg-[var(--color-background)] rounded-sm p-3 whitespace-pre-wrap font-sans leading-relaxed border border-border">
              {email_draft.body}
            </pre>
            {email_draft.ps_line && (
              <p className="mt-2 text-sm text-muted-foreground italic pl-3 border-l-2 border-[var(--color-chart-6)]">
                {email_draft.ps_line}
              </p>
            )}
          </div>

          {email_draft.recommended_send_time && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {t("emailDraft.bestSendTime", { time: email_draft.recommended_send_time })}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Meeting Structure */}
      <CollapsibleSection
        title={t("meeting.title")}
        icon={Calendar}
        badge={`${meeting_structure.total_duration_minutes} min`}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("meeting.objective")}</p>
            <p className="text-sm text-foreground">{meeting_structure.objective}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">{t("meeting.agenda")}</p>
            <div className="space-y-2">
              {meeting_structure.agenda_items.map((item, i) => (
                <div key={i} className="flex items-start gap-4 text-sm">
                  <span className="min-w-[40px] text-xs text-muted-foreground pt-1">
                    {item.duration_minutes}m
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {meeting_structure.pre_meeting_prep.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">{t("meeting.prep")}</p>
              <ul className="space-y-1">
                {meeting_structure.pre_meeting_prep.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-[var(--success)] mt-1 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted-foreground rounded-sm p-3 border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,var(--color-background))]">
            <span className="font-medium text-[var(--success)]">{t("meeting.successCriteria")} </span>
            {meeting_structure.success_criteria}
          </div>
        </div>
      </CollapsibleSection>

      {/* Next Steps */}
      <CollapsibleSection
        title={t("nextSteps.title")}
        icon={ListChecks}
        badge={next_steps.horizon}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            {next_steps.actions.map((action, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 text-xs rounded-sm border px-3 py-2 ${priorityColors[action.priority]}`}
              >
                <div className="flex-1">
                  <p className="font-medium">{action.action}</p>
                  <div className="flex items-center gap-2 mt-1 opacity-75">
                    <span>{t(`owner.${action.owner}`)}</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" />
                    <span>{action.timing}</span>
                  </div>
                </div>
                <span className="font-medium shrink-0">{t(`priority.${action.priority}`)}</span>
              </div>
            ))}
          </div>

          {next_steps.key_risk && (
            <div className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[color-mix(in_srgb,var(--warning)_15%,var(--color-background))] border border-[var(--warning)] rounded-sm p-3">
              <AlertTriangle className="w-3.5 h-3.5 mt-1 shrink-0" />
              <div>
                <span className="font-medium">{t("nextSteps.keyRisk")} </span>
                {next_steps.key_risk}
              </div>
            </div>
          )}

          {next_steps.success_milestone && (
            <div className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[color-mix(in_srgb,var(--success)_15%,var(--color-background))] border border-[var(--success)] rounded-sm p-3">
              <CheckCircle2 className="w-3.5 h-3.5 mt-1 shrink-0" />
              <div>
                <span className="font-medium">{t("nextSteps.successMilestone")} </span>
                {next_steps.success_milestone}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
