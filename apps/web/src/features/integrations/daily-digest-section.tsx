"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StateChip } from "@/features/control/components/primitives";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { useDigestSettings, useSendDigestNow, useUpdateDigestSettings } from "@/hooks/queries/use-digest";
import type { DigestSettings } from "@/lib/api/digest";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * "Resumen diario" — La jugada de hoy, posted to a Slack/Teams incoming
 * webhook at a chosen UTC hour. The webhook URL is write-only (the API
 * only ever returns a hint), so the field starts empty and saving a new
 * value replaces the stored one; the hint under it says which is set.
 */
export function DailyDigestSection({ canManage, span = 12 }: { canManage: boolean; span?: 4 | 6 | 8 | 12 }) {
  const { data, isLoading } = useDigestSettings();
  if (isLoading || !data) {
    return <Skeleton className="rounded-[var(--radius-lg)]" style={{ gridColumn: `span ${span}` }} />;
  }
  // Keyed on the server state so a save (or another admin's change picked
  // up by a refetch) resets the form's local copy without an effect.
  return <DigestForm key={`${data.hour_utc}-${data.enabled}-${data.webhook_url_hint ?? ""}`} data={data} canManage={canManage} span={span} />;
}

function DigestForm({ data, canManage, span }: { data: DigestSettings; canManage: boolean; span: 4 | 6 | 8 | 12 }) {
  const t = useTranslations("workspace.integrations.digest");
  const locale = useLocale() as Locale;
  const update = useUpdateDigestSettings();
  const sendNow = useSendDigestNow();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [hour, setHour] = useState(data.hour_utc);
  const [enabled, setEnabled] = useState(data.enabled);
  const on = data.enabled && data.webhook_configured;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body: { enabled: boolean; hour_utc: number; webhook_url?: string } = { enabled, hour_utc: hour };
      if (webhookUrl.trim()) body.webhook_url = webhookUrl.trim();
      await update.mutateAsync(body);
      setWebhookUrl("");
      toast.success(t("savedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    }
  }

  async function handleSendNow() {
    try {
      const result = await sendNow.mutateAsync();
      if (result.sent) toast.success(t("sentToast", { count: result.cards }));
      else toast.error(t(`skipReasons.${result.reason ?? "delivery_failed"}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    }
  }

  return (
    <OverviewCard
      span={span}
      title={t("title")}
      caption={t("subtitle")}
      action={
        <StateChip hue={TONE.calm} level={on ? 45 : "rest"}>
          {on ? t("statusOn") : t("statusOff")}
        </StateChip>
      }
    >
      <form onSubmit={handleSave} className="bee-fill flex flex-col gap-3">
        <Field label={t("webhookLabel")}>
          <input
            id="digest-webhook"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={data.webhook_configured ? t("webhookSetPlaceholder", { hint: data.webhook_url_hint ?? "" }) : "https://hooks.slack.com/services/…"}
            disabled={!canManage}
            className="bee-input"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={t("hourLabel")}>
            <select id="digest-hour" value={hour} onChange={(e) => setHour(Number(e.target.value))} disabled={!canManage} className="bee-input">
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 UTC
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("scheduleLabel")}>
            <div className="flex gap-1.5">
              <Pill pressed={enabled} fill={tint(TONE.calm, 45)} disabled={!canManage} onClick={() => setEnabled(true)}>
                {t("enabledLabel")}
              </Pill>
              <Pill pressed={!enabled} fill={tint(TONE.calm, 45)} disabled={!canManage} onClick={() => setEnabled(false)}>
                {t("pausedLabel")}
              </Pill>
            </div>
          </Field>
        </div>
        <p className="bee-micro">{data.last_sent_at ? t("lastSent", { when: formatRelativeTime(data.last_sent_at, locale) }) : t("neverSent")}</p>
        {canManage && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => void handleSendNow()} disabled={sendNow.isPending || !data.webhook_configured} className="bee-btn-ghost">
              {sendNow.isPending ? t("sending") : t("sendNow")}
            </button>
            <button type="submit" disabled={update.isPending} className="bee-btn bee-btn--primary">
              {update.isPending ? t("saving") : t("save")}
            </button>
          </div>
        )}
      </form>
    </OverviewCard>
  );
}
