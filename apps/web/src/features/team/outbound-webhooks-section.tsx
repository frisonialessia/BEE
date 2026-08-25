"use client";

import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  useCreateOutboundWebhook,
  useDeleteOutboundWebhook,
  useOutboundWebhookEventTypes,
  useOutboundWebhooks,
  useUpdateOutboundWebhook,
} from "@/hooks/queries/use-outbound-webhooks";
import type { OutboundWebhookCreated } from "@/lib/api/outbound-webhooks";

const EVENT_TYPE_LABELS: Record<string, string> = {
  "opportunity.won": "Oportunidad ganada",
  "opportunity.lost": "Oportunidad perdida",
  "opportunity.ready_to_action": "Battlecard lista para actuar",
};

function NewWebhookForm({ eventTypes, onDone }: { eventTypes: string[]; onDone: (secret: OutboundWebhookCreated) => void }) {
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
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuevo webhook</p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://hooks.zapier.com/hooks/catch/..."
        required
        className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {eventTypes.map((type) => (
          <label
            key={type}
            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-2.5 py-1.5 text-xs"
          >
            <input
              type="checkbox"
              checked={selected.includes(type)}
              onChange={() => toggle(type)}
              className="size-3.5 accent-[var(--color-chart-4)]"
            />
            {EVENT_TYPE_LABELS[type] ?? type}
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!url.trim() || selected.length === 0 || createWebhook.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createWebhook.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function StatusBadge({ status }: { status: "success" | "failed" | null }) {
  if (status === null) {
    return <span className="bee-micro">Sin intentos todavía</span>;
  }
  return status === "success" ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]">
      <CheckCircle2 className="size-3" /> Entregado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
      <AlertTriangle className="size-3" /> Falló la última entrega
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
  const { data: webhooksResult, isLoading } = useOutboundWebhooks();
  const { data: eventTypes } = useOutboundWebhookEventTypes();
  const updateWebhook = useUpdateOutboundWebhook();
  const deleteWebhook = useDeleteOutboundWebhook();
  const [showNew, setShowNew] = useState(false);
  const [justCreated, setJustCreated] = useState<OutboundWebhookCreated | null>(null);

  const webhooks = webhooksResult?.data ?? [];

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="bee-eyebrow">Integraciones</p>
          <h2 className="mt-1 text-base font-semibold">Webhooks salientes</h2>
          <p className="bee-caption mt-1">
            BEE avisa a tu Zapier, Make, Slack, o sistema propio cuando algo pasa — sin credenciales de socio
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="bee-btn bee-btn--primary text-xs"
          >
            + Nuevo webhook
          </button>
        )}
      </div>

      {justCreated && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/10 p-4">
          <p className="text-xs font-semibold">Guarda este secreto ahora — no se vuelve a mostrar</p>
          <code className="mt-2 block break-all rounded-[var(--radius-md)] bg-[var(--color-card)] px-3 py-2 text-xs">
            {justCreated.secret}
          </code>
          <p className="mt-2 bee-micro">
            BEE firma cada envío con este secreto (header <code>X-BEE-Signature</code>) para que tu sistema
            pueda verificar que el evento realmente vino de BEE.
          </p>
          <button
            type="button"
            onClick={() => setJustCreated(null)}
            className="bee-btn-ghost mt-2 text-xs"
          >
            Ya lo guardé
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
        <p className="bee-caption">Cargando…</p>
      ) : webhooks.length === 0 ? (
        <p className="bee-caption">
          {canManage
            ? "Todavía no hay webhooks configurados — crea el primero arriba."
            : "Todavía no hay webhooks configurados."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-[var(--radius-md)] bg-[var(--color-primary)]/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {w.event_types.map((t) => (
                      <span
                        key={t}
                        className="rounded-[var(--radius-sm)] bg-[var(--color-card)] px-1.5 py-0.5 bee-micro"
                      >
                        {EVENT_TYPE_LABELS[t] ?? t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 font-mono bee-micro">
                    secreto {w.secret_preview}… · <StatusBadge status={w.last_status} />
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="flex items-center gap-1.5 bee-micro">
                      <input
                        type="checkbox"
                        checked={w.is_active}
                        onChange={(e) =>
                          updateWebhook.mutate({ id: w.id, body: { is_active: e.target.checked } })
                        }
                        className="size-3.5 accent-[var(--color-chart-4)]"
                      />
                      Activo
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteWebhook.mutate(w.id)}
                      disabled={deleteWebhook.isPending}
                      className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-[var(--color-chart-2)]/20 hover:text-[var(--color-chart-2)]"
                      aria-label="Eliminar webhook"
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
