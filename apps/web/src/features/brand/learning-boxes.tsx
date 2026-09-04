"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip, FormLabel } from "@/features/brand/brand-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { acknowledgeAnomaly, checkAnomalies, getAnomalyAlerts, getStyleProfile, recordCorrection } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { AnomalyAlert, ChannelStatus, CorrectionOut, StyleProfileOut } from "@/lib/types";

// ── Style learning ───────────────────────────────────────────────────────────

const ARTIFACT_TYPE_KEYS = ["email_draft", "meeting_agenda", "linkedin_message", "next_steps"] as const;

/** Row 4, left — paste BEE's draft and your edit; BEE learns the rule. One hue: violet. */
export function StyleLearningBox({
  styleProfile,
  onProfile,
}: {
  styleProfile: StyleProfileOut | null;
  onProfile: (profile: StyleProfileOut | null) => void;
}) {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.correction");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.learning");
  const hue = DATA.violet;

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
      <div className="bee-fill flex flex-col gap-3">
        <div>
          <FormLabel htmlFor="brand-artifact-type">{t("artifactTypeLabel")}</FormLabel>
          <select id="brand-artifact-type" value={artifactType} onChange={(e) => setArtifactType(e.target.value)} className="bee-input">
            {ARTIFACT_TYPE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`artifactTypes.${key}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <FormLabel htmlFor="brand-correction-original">{t("originalLabel")}</FormLabel>
            <textarea
              id="brand-correction-original"
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              rows={4}
              className="bee-input"
              style={{ background: mix(hue, 6) }}
            />
          </div>
          <div>
            <FormLabel htmlFor="brand-correction-edited">{t("editedLabel")}</FormLabel>
            <textarea
              id="brand-correction-edited"
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              rows={4}
              className="bee-input"
              style={{ background: mix(hue, 16) }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void handleSubmit()} disabled={loading} className="bee-btn bee-btn--primary text-xs">
            {loading ? t("learning") : t("submit")}
          </button>
          <button type="button" onClick={() => setShowProfile((v) => !v)} className="bee-btn-text text-xs">
            {t("viewFullProfile")}
          </button>
        </div>

        {result && (
          <div className="space-y-2 rounded-[var(--radius-md)] p-3" style={{ background: mix(hue, 10) }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{t("resultTitle")}</p>
              <Chip tone={hue} strength={24}>
                {t("versionBadge", { version: result.profile_version, count: result.total_corrections })}
              </Chip>
            </div>
            {result.extracted_rules.length > 0 && (
              <div>
                <p className="bee-micro mb-1">{t("rulesLearnedTitle")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.extracted_rules.map((rule) => (
                    <Chip key={rule} tone={hue} strength={20}>
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
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-divider)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t("currentProfileTitle")}</span>
                <span className="bee-micro">
                  {t("profileStats", { authoritative: styleProfile.authoritative_rules_count, total: styleProfile.total_corrections })}
                </span>
              </div>
              {styleProfile.style_summary ? (
                <pre className="whitespace-pre-wrap font-mono text-xs">{styleProfile.style_summary}</pre>
              ) : (
                <p className="bee-micro">{t("needMoreCorrections")}</p>
              )}
            </div>
          ) : (
            <p className="bee-caption">{t("needMoreCorrections")}</p>
          ))}
      </div>
    </OverviewCard>
  );
}

// ── Anomaly monitor ──────────────────────────────────────────────────────────

/** Severity is one hue at four strengths — the most severe alert is the
 *  most saturated, never a second color. */
const SEVERITY_STRENGTH: Record<string, number> = { critical: 100, high: 65, medium: 40, low: 22 };

function AlertRow({ alert, onAcknowledge }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void }) {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.anomaly");
  const hue = DATA.magenta;
  const strength = SEVERITY_STRENGTH[alert.severity] ?? 22;
  const [expanded, setExpanded] = useState(false);
  const severityLabel = (["critical", "high", "medium", "low"] as const).includes(alert.severity) ? t(`severity.${alert.severity}`) : alert.severity;

  return (
    <li className="space-y-2 rounded-[var(--radius-md)] p-3" style={{ background: mix(hue, Math.round(strength / 8)), borderLeft: `3px solid ${mix(hue, strength)}` }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{alert.title}</p>
          <p className="bee-micro mt-0.5">
            {t("currentVsBase", {
              rolling: (alert.rolling_rate * 100).toFixed(1),
              baseline: (alert.baseline_rate * 100).toFixed(1),
              deviation: alert.deviation_pct.toFixed(1),
            })}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: mix(hue, Math.round(strength * 0.3)) }}>
          <span className="size-1.5 rounded-full" style={{ background: mix(hue, strength) }} />
          {severityLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {alert.status === "open" && (
          <button type="button" onClick={() => onAcknowledge(alert.id)} className="bee-btn text-xs">
            {t("acknowledge")}
          </button>
        )}
        <button type="button" onClick={() => setExpanded((v) => !v)} className="bee-btn-text text-xs">
          {expanded ? t("hideDetails") : t("showDetails")}
        </button>
      </div>
      {expanded && (
        <div className="space-y-1 text-xs">
          <p className="text-[var(--color-text-muted)]">{alert.description}</p>
          {alert.suggested_actions.length > 0 && (
            <ul className="space-y-1">
              {alert.suggested_actions.map((a, i) => (
                <li key={i} className="flex gap-1">
                  <span>•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Row 4, middle — conversion drops per channel/sector. One hue: magenta. */
export function AnomalyMonitorBox() {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.anomaly");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.anomaly");
  const hue = DATA.magenta;
  // Open alerts show on arrival — the box used to stay empty until a scan
  // was run, even when alerts already existed. Keyed under the same family
  // as Control's useOpenAnomalies (so its invalidations refresh this box
  // too) but with its own suffix: this reads the full AnomalyAlert shape,
  // Control reads a narrower one, and the two must not share a cache entry.
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
      span={4}
      title={tp("title")}
      caption={tp("caption")}
      action={
        <button type="button" onClick={() => void handleCheck()} disabled={checking} className="bee-btn-ghost text-xs">
          {checking ? t("scanning") : t("runScan")}
        </button>
      }
    >
      <div className="bee-fill flex flex-col gap-2">
        {summary && <p className="bee-micro">{summary}</p>}
        {alertsQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <span className="size-2.5 rounded-full" style={{ background: mix(hue, 45) }} />
            <p className="mt-2 text-sm font-medium">{t("empty.title")}</p>
            <p className="bee-caption mt-0.5">{t("empty.hint")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} onAcknowledge={(id) => void handleAcknowledge(id)} />
            ))}
          </ul>
        )}
      </div>
    </OverviewCard>
  );
}

// ── Channels ─────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, string> = { email: "✉", linkedin: "in", twitter: "𝕏" };
const CHANNEL_KEYS = ["email", "linkedin", "twitter"] as const;

/** Row 4, right — where BEE can send in your voice. One hue: lavender. */
export function ChannelsBox({ channels }: { channels: ChannelStatus[] }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.channels");
  const hue = DATA.lavender;
  const label = (channel: string) =>
    (CHANNEL_KEYS as readonly string[]).includes(channel) ? t(`channelLabels.${channel as (typeof CHANNEL_KEYS)[number]}`) : channel;

  return (
    <OverviewCard span={3} title={tp("title")} caption={tp("caption")}>
      <div className="bee-fill flex flex-col justify-evenly gap-2">
        {channels.length === 0 && <p className="bee-caption py-6 text-center">{tp("empty")}</p>}
        {channels.map((ch) => (
          <div key={ch.channel} className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(hue, ch.mock ? 12 : 32) }}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-xs font-bold" style={{ background: mix(hue, ch.mock ? 24 : 60) }}>
              {CHANNEL_ICONS[ch.channel] ?? ch.channel[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{label(ch.channel)}</p>
              <p className="bee-micro truncate">
                {ch.mock ? t("notConnected") : t("active")}
                {ch.tokens_remaining != null && ` · ${t("tokensRemaining", { count: ch.tokens_remaining })}`}
              </p>
            </div>
            <span className="size-2 shrink-0 rounded-full" style={{ background: ch.mock ? mix(hue, 40) : hue }} aria-hidden />
          </div>
        ))}
        {channels.length > 0 && channels.every((c) => c.mock) && (
          <p className="bee-micro">
            {t.rich("allChannelsSimulated", {
              integrations: (chunks) => <span className="font-medium text-[var(--color-text)]">{chunks}</span>,
            })}
          </p>
        )}
      </div>
    </OverviewCard>
  );
}
