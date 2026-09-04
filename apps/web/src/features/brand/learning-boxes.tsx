"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { REST, TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip } from "@/features/brand/brand-primitives";
import { EmptyLine, RowsSkeleton, StateWord, type DotLevel } from "@/features/control/components/primitives";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { acknowledgeAnomaly, checkAnomalies, getAnomalyAlerts, getStyleProfile, recordCorrection } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { AnomalyAlert, ChannelStatus, CorrectionOut, StyleProfileOut } from "@/lib/types";

const HUE = TONE.urgency;

// ── Style learning ───────────────────────────────────────────────────────────

const ARTIFACT_TYPE_KEYS = ["email_draft", "meeting_agenda", "linkedin_message", "next_steps"] as const;

/** Paste BEE's draft and your edit; BEE learns the rule. The artifact type
 *  is a row of pills, the two texts sit side by side. */
export function StyleLearningBox({ styleProfile, onProfile }: { styleProfile: StyleProfileOut | null; onProfile: (profile: StyleProfileOut | null) => void }) {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.correction");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.learning");

  const [result, setResult] = useState<CorrectionOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  // Seeded example values — a plausible pair to edit rather than two blank
  // boxes, in the interface's own language.
  const [original, setOriginal] = useState(t("defaultOriginal"));
  const [edited, setEdited] = useState(t("defaultEdited"));
  const [artifactType, setArtifactType] = useState<string>("email_draft");

  async function handleSubmit() {
    setLoading(true);
    try {
      const r = await recordCorrection({ original_content: original, edited_content: edited, artifact_type: artifactType });
      setResult(r.data);
      const p = await getStyleProfile();
      onProfile(p.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <OverviewCard span={5} title={tp("title")} caption={tp("caption")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="bee-fill flex flex-col gap-3"
      >
        <Field label={t("artifactTypeLabel")}>
          <div className="flex flex-wrap gap-1.5">
            {ARTIFACT_TYPE_KEYS.map((key) => (
              <Pill key={key} pressed={artifactType === key} fill={tint(HUE, 45)} onClick={() => setArtifactType(key)}>
                {t(`artifactTypes.${key}`)}
              </Pill>
            ))}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("originalLabel")}>
            <textarea id="brand-correction-original" value={original} onChange={(e) => setOriginal(e.target.value)} rows={4} className="bee-input" />
          </Field>
          <Field label={t("editedLabel")}>
            <textarea id="brand-correction-edited" value={edited} onChange={(e) => setEdited(e.target.value)} rows={4} className="bee-input" />
          </Field>
        </div>

        {result && (
          <div className="space-y-2 rounded-[var(--radius-md)] p-3" style={{ background: REST }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{t("resultTitle")}</p>
              <Chip tone={HUE} strength={45}>
                {t("versionBadge", { version: result.profile_version, count: result.total_corrections })}
              </Chip>
            </div>
            {result.extracted_rules.length > 0 && (
              <div>
                <p className="bee-micro mb-1">{t("rulesLearnedTitle")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.extracted_rules.map((rule) => (
                    <Chip key={rule} tone={HUE} strength={45}>
                      {rule.replace(/_/g, " ")}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <p className="bee-micro">{t("changeRatio", { pct: (result.change_ratio * 100).toFixed(0), count: result.authoritative_rules_count })}</p>
          </div>
        )}

        {showProfile &&
          (styleProfile && styleProfile.total_corrections > 0 ? (
            <div className="space-y-2 rounded-[var(--radius-md)] p-3" style={{ background: REST }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t("currentProfileTitle")}</span>
                <span className="bee-micro">{t("profileStats", { authoritative: styleProfile.authoritative_rules_count, total: styleProfile.total_corrections })}</span>
              </div>
              {styleProfile.style_summary ? <pre className="whitespace-pre-wrap font-mono text-xs">{styleProfile.style_summary}</pre> : <p className="bee-micro">{t("needMoreCorrections")}</p>}
            </div>
          ) : (
            <p className="bee-caption">{t("needMoreCorrections")}</p>
          ))}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <button type="button" onClick={() => setShowProfile((v) => !v)} className="bee-btn-text text-xs">
            {t("viewFullProfile")}
          </button>
          <button type="submit" disabled={loading} className="bee-btn bee-btn--primary">
            {loading ? t("learning") : t("submit")}
          </button>
        </div>
      </form>
    </OverviewCard>
  );
}

// ── Anomaly monitor ──────────────────────────────────────────────────────────

/** Severity is one hue at three intensities and the page grey. */
const SEVERITY_LEVEL: Record<string, DotLevel> = { critical: 100, high: 70, medium: 45, low: "rest" };

function AlertRow({ alert, onAcknowledge }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void }) {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.anomaly");
  const severityLabel = (["critical", "high", "medium", "low"] as const).includes(alert.severity) ? t(`severity.${alert.severity}`) : alert.severity;

  return (
    <li className="bee-row flex-wrap justify-between sm:flex-nowrap" title={alert.description}>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium leading-tight">{alert.title}</p>
        <p className="bee-micro truncate" title={alert.recommendation}>
          {t("currentVsBase", { rolling: (alert.rolling_rate * 100).toFixed(1), baseline: (alert.baseline_rate * 100).toFixed(1), deviation: alert.deviation_pct.toFixed(1) })}
        </p>
      </div>
      <StateWord hue={HUE} level={SEVERITY_LEVEL[alert.severity] ?? "rest"}>
        {severityLabel}
      </StateWord>
      {alert.status === "open" && (
        <button type="button" onClick={() => onAcknowledge(alert.id)} className="bee-btn-ghost shrink-0 text-xs">
          {t("acknowledge")}
        </button>
      )}
    </li>
  );
}

/** Conversion drops per channel/sector. Not on the Voz de marca board any
 *  more — Control › Salud shows the same alerts — but kept for any host
 *  that wants the scan button. */
export function AnomalyMonitorBox() {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.anomaly");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.anomaly");
  // Keyed under the same family as Control's useOpenAnomalies (so its
  // invalidations refresh this box too) but with its own suffix: this
  // reads the full AnomalyAlert shape, Control reads a narrower one.
  const alertsQuery = useQuery({
    queryKey: [...queryKeys.anomalies.all, "open", "full"] as const,
    queryFn: async () => getAnomalyAlerts({ status: "open" }),
  });
  const alerts = alertsQuery.data?.data ?? [];
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState("");

  async function handleCheck() {
    setChecking(true);
    try {
      const r = await checkAnomalies();
      setSummary(r.data.summary);
      await alertsQuery.refetch();
    } finally {
      setChecking(false);
    }
  }

  async function handleAcknowledge(id: string) {
    await acknowledgeAnomaly(id, t("acknowledgeNote"));
    await alertsQuery.refetch();
  }

  return (
    <OverviewCard
      span={6}
      title={tp("title")}
      caption={tp("caption")}
      action={
        <button type="button" onClick={() => void handleCheck()} disabled={checking} className="bee-btn-ghost text-xs">
          {checking ? t("scanning") : t("runScan")}
        </button>
      }
    >
      {summary && <p className="bee-micro">{summary}</p>}
      {alertsQuery.isLoading ? (
        <RowsSkeleton rows={2} />
      ) : alerts.length === 0 ? (
        <EmptyLine>{t("empty.title")}</EmptyLine>
      ) : (
        <ul className="bee-fill min-h-0">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} onAcknowledge={(id) => void handleAcknowledge(id)} />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

// ── Channels ─────────────────────────────────────────────────────────────────

const CHANNEL_KEYS = ["email", "linkedin", "twitter"] as const;

/** Where BEE can send in your voice: one row per channel, the state as a
 *  lavender dot (100 live, page grey simulated) + word. */
export function ChannelsBox({ channels }: { channels: ChannelStatus[] }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.channels");
  const label = (channel: string) => ((CHANNEL_KEYS as readonly string[]).includes(channel) ? t(`channelLabels.${channel as (typeof CHANNEL_KEYS)[number]}`) : channel);

  return (
    <OverviewCard span={4} title={tp("title")} caption={tp("caption")}>
      {channels.length === 0 ? (
        <EmptyLine>{tp("empty")}</EmptyLine>
      ) : (
        <ul className="bee-fill flex min-h-0 flex-col justify-around">
          {channels.map((ch) => (
            <li key={ch.channel} className="bee-row justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{label(ch.channel)}</p>
                <p className="truncate bee-micro">{ch.tokens_remaining != null ? t("tokensRemaining", { count: ch.tokens_remaining }) : tp("rateLimit", { count: ch.rate_limit.requests_per_day })}</p>
              </div>
              <StateWord hue={TONE.calm} level={ch.mock ? "rest" : 100}>
                {ch.mock ? t("notConnected") : t("active")}
              </StateWord>
            </li>
          ))}
        </ul>
      )}
      {channels.length > 0 && channels.every((c) => c.mock) && (
        <p className="mt-2 shrink-0 bee-micro">
          {t.rich("allChannelsSimulated", {
            integrations: (chunks) => <span className="font-medium text-[var(--color-text)]">{chunks}</span>,
          })}
        </p>
      )}
    </OverviewCard>
  );
}
