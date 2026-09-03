"use client";

import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  useCreateOutboundWebhook,
  useDeleteOutboundWebhook,
  useOutboundWebhookEventTypes,
  useOutboundWebhooks,
  useUpdateOutboundWebhook,
} from "@/hooks/queries/use-outbound-webhooks";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { OutboundWebhookCreated } from "@/lib/api/outbound-webhooks";

/** Event type values use dots (`opportunity.won`) which next-intl reads as
 * nested-key separators — so the lookup goes through this map (translated
 * keys, camelCase) instead of `t(`eventTypes.${type}`)` directly. */
function useEventTypeLabels(): Record<string, string> {
  const t = useTranslations("workspace.team.webhooks.eventTypes");
  return {
    "opportunity.won": t("opportunityWon"),
    "opportunity.lost": t("opportunityLost"),
    "opportunity.ready_to_action": t("opportunityReadyToAction"),
  };
}

function NewWebhookForm({ eventTypes, onDone }: { eventTypes: string[]; onDone: (secret: OutboundWebhookCreated) => void }) {
  const t = useTranslations("workspace.team.webhooks.form");
  const eventTypeLabels = useEventTypeLabels();
  const createWebhook = useCreateOutboundWebhook();
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(type: string) {
    setSelected((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || selected.length === 0) return;
    const created = await createWebhook.mutateAsync({ url: url.trim(), event_types: selected });
    onDone(created);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("newTitle")}</p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("urlPlaceholder")}
        required
        className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {eventTypes.map((type) => (
          <Label
            key={type}
            className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs font-normal"
          >
            <Checkbox checked={selected.includes(type)} onCheckedChange={() => toggle(type)} />
            {eventTypeLabels[type] ?? type}
          </Label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!url.trim() || selected.length === 0 || createWebhook.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createWebhook.isPending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

function StatusBadge({ status }: { status: "success" | "failed" | null }) {
  const t = useTranslations("workspace.team.webhooks.status");
  if (status === null) {
    return <span className="bee-micro">{t("noAttempts")}</span>;
  }
  return status === "success" ? (
    <span className="inline-flex items-center gap-1 text-micro text-[var(--success)]">
      <CheckCircle2 className="size-3" /> {t("delivered")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-micro text-destructive">
      <AlertTriangle className="size-3" /> {t("lastFailed")}
    </span>
  );
}

/** Webhooks salientes — a diferencia de las integraciones con
 *  WORKFLOW_CRM_URL/etc. (una sola URL fija por variable de entorno), esto
 *  es lo que cualquier organización configura por sí misma desde el
 *  dashboard: apuntar eventos de BEE (deal ganado, deal perdido, battlecard
 *  lista) a Zapier, Make, un webhook entrante de Slack, o su propio
 *  sistema — sin credenciales de socio de por medio en ningún lado. */
export function OutboundWebhooksSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("workspace.team.webhooks");
  const eventTypeLabels = useEventTypeLabels();
  const { data: webhooksResult, isLoading } = useOutboundWebhooks();
  const { data: eventTypes } = useOutboundWebhookEventTypes();
  const updateWebhook = useUpdateOutboundWebhook();
  const deleteWebhook = useDeleteOutboundWebhook();
  const [showNew, setShowNew] = useState(false);
  const [justCreated, setJustCreated] = useState<OutboundWebhookCreated | null>(null);

  const webhooks = webhooksResult?.data ?? [];

  return (
    <section className="bee-bento bee-bento-pad space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 text-base font-semibold">{t("title")}</h2>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="bee-btn bee-btn--primary text-xs"
          >
            {t("newWebhook")}
          </button>
        )}
      </div>

      {justCreated && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/10 p-4">
          <p className="text-xs font-semibold">{t("secretReveal.title")}</p>
          <code className="mt-2 block break-all rounded-[var(--radius-md)] bg-[var(--color-card)] px-3 py-2 text-xs">
            {justCreated.secret}
          </code>
          <p className="mt-2 bee-micro">
            {t("secretReveal.helpPrefix")} <code>X-BEE-Signature</code>
            {t("secretReveal.helpSuffix")}
          </p>
          <button
            type="button"
            onClick={() => setJustCreated(null)}
            className="bee-btn-ghost mt-2 text-xs"
          >
            {t("secretReveal.confirm")}
          </button>
        </div>
      )}

      {showNew && (
        <NewWebhookForm
          eventTypes={eventTypes ?? []}
          onDone={(created) => {
            setShowNew(false);
            setJustCreated(created);
          }}
        />
      )}

      {isLoading ? (
        <p className="bee-caption">{t("loading")}</p>
      ) : webhooks.length === 0 ? (
        <p className="bee-caption">{canManage ? t("emptyManage") : t("emptyView")}</p>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <div key={w.id} className="bee-bento p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.url}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {w.event_types.map((et) => (
                      <span
                        key={et}
                        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)]/25 px-2 py-1 bee-micro"
                      >
                        {eventTypeLabels[et] ?? et}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 font-mono bee-micro">
                    {t("secretPrefix")} {w.secret_preview}… · <StatusBadge status={w.last_status} />
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Label className="bee-micro font-normal">
                      <Checkbox
                        checked={w.is_active}
                        onCheckedChange={(checked) =>
                          updateWebhook.mutate({ id: w.id, body: { is_active: checked === true } })
                        }
                      />
                      {t("active")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => deleteWebhook.mutate(w.id)}
                      disabled={deleteWebhook.isPending}
                      className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-[var(--color-chart-2)]/20 hover:text-[var(--color-chart-2)]"
                      aria-label={t("deleteAria")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
