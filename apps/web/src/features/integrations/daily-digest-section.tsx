"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
export function DailyDigestSection({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useDigestSettings();
  if (isLoading || !data) {
    return <Skeleton className="h-40" />;
  }
  // Keyed on the server state so a save (or another admin's change picked
  // up by a refetch) resets the form's local copy without an effect.
  return <DigestForm key={`${data.hour_utc}-${data.enabled}-${data.webhook_url_hint ?? ""}`} data={data} canManage={canManage} />;
}

function DigestForm({ data, canManage }: { data: DigestSettings; canManage: boolean }) {
  const t = useTranslations("workspace.integrations.digest");
  const locale = useLocale() as Locale;
  const update = useUpdateDigestSettings();
  const sendNow = useSendDigestNow();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [hour, setHour] = useState(data.hour_utc);
  const [enabled, setEnabled] = useState(data.enabled);

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
    <section className="bee-surface bee-bento-pad space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("title")}</p>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
        <Badge variant={data.enabled && data.webhook_configured ? "success" : "outline"}>
          {data.enabled && data.webhook_configured ? t("statusOn") : t("statusOff")}
        </Badge>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="min-w-0">
          <label className="bee-micro font-medium" htmlFor="digest-webhook">
            {t("webhookLabel")}
          </label>
          <input
            id="digest-webhook"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={data.webhook_configured ? t("webhookSetPlaceholder", { hint: data.webhook_url_hint ?? "" }) : "https://hooks.slack.com/services/…"}
            disabled={!canManage}
            className="bee-input mt-1 w-full"
          />
        </div>
        <div>
          <label className="bee-micro font-medium" htmlFor="digest-hour">
            {t("hourLabel")}
          </label>
          <select
            id="digest-hour"
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            disabled={!canManage}
            className="bee-input mt-1"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00 UTC
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex h-[var(--bee-control-h-primary)] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!canManage}
              className="size-4 accent-[var(--color-cta)]"
            />
            {t("enabledLabel")}
          </label>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button type="submit" disabled={update.isPending} className="bee-btn bee-btn--primary">
              {update.isPending ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={() => void handleSendNow()}
              disabled={sendNow.isPending || !data.webhook_configured}
              className="bee-btn-ghost"
            >
              <Send className="size-3.5" />
              {sendNow.isPending ? t("sending") : t("sendNow")}
            </button>
          </div>
        )}
      </form>

      <p className="bee-caption">
        {data.last_sent_at
          ? t("lastSent", { when: formatRelativeTime(data.last_sent_at, locale) })
          : t("neverSent")}
      </p>
    </section>
  );
}
