"use client";

import { Mail, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateTemplate,
  useDeleteTemplate,
  useTemplates,
  useUpdateTemplate,
} from "@/hooks/queries/use-templates";
import type { MessageTemplate } from "@/lib/api/templates";

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  other: "Otro",
};

function TemplateForm({
  initial,
  onDone,
}: {
  initial?: MessageTemplate;
  onDone: () => void;
}) {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "email");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");

  const pending = createTemplate.isPending || updateTemplate.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    const payload = {
      name: name.trim(),
      channel,
      subject: subject.trim() || undefined,
      body: body.trim(),
    };
    if (initial) {
      await updateTemplate.mutateAsync({ id: initial.id, body: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {initial ? "Editar plantilla" : "Nueva plantilla"}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre *"
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none"
        >
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="other">Otro</option>
        </select>
        {channel === "email" && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Asunto"
            className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
        )}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Cuerpo del mensaje — usa {{first_name}}, {{company_name}}, etc. como marcadores"
        required
        rows={4}
        className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || !body.trim() || pending}
          className="bee-btn bee-btn--primary"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Biblioteca de mensajes reutilizables — el contenido con el que arrancar
 *  una secuencia, en vez de escribir desde cero cada vez. Sin relación
 *  todavía con DynamicSequence; el siguiente paso natural es que un step
 *  pueda apuntar a una plantilla por id. */
export function MessageLibrary() {
  const { data: result, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);

  const templates = result?.data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="bee-caption">
          Contenido reutilizable para tus secuencias — escribe el mensaje una vez, úsalo siempre
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowNew((v) => !v);
          }}
          className="bee-btn bee-btn--primary shrink-0"
        >
          + Nueva plantilla
        </button>
      </div>

      {showNew && <TemplateForm onDone={() => setShowNew(false)} />}
      {editing && <TemplateForm initial={editing} onDone={() => setEditing(null)} />}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay plantillas guardadas.</p>
          <p className="bee-caption mt-1">Crea la primera para reutilizarla en tus secuencias.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="bee-bento bee-bento-pad">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <p className="text-sm font-semibold">{t.name}</p>
                </div>
                <Badge variant="outline">{CHANNEL_LABELS[t.channel] ?? t.channel}</Badge>
              </div>
              {t.subject && (
                <p className="mt-2 truncate text-xs font-medium text-muted-foreground">{t.subject}</p>
              )}
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{t.body}</p>
              <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowNew(false);
                    setEditing(t);
                  }}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--color-primary)]/40 hover:text-foreground"
                >
                  <Pencil className="size-3" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate.mutate(t.id)}
                  disabled={deleteTemplate.isPending}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--color-chart-2)]/20 hover:text-[var(--color-chart-2)]"
                >
                  <Trash2 className="size-3" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
