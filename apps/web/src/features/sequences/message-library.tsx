"use client";

import { Mail, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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

function TemplateForm({
  initial,
  onDone,
}: {
  initial?: MessageTemplate;
  onDone: () => void;
}) {
  const t = useTranslations("workspace.sequences.library");
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
        {initial ? t("form.editTitle") : t("form.newTitle")}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("form.namePlaceholder")}
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none"
        >
          <option value="email">{t("channels.email")}</option>
          <option value="linkedin">{t("channels.linkedin")}</option>
          <option value="other">{t("channels.other")}</option>
        </select>
        {channel === "email" && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("form.subjectPlaceholder")}
            className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
        )}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("form.bodyPlaceholder")}
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
          {pending ? t("form.saving") : t("form.save")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("form.cancel")}
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
  const t = useTranslations("workspace.sequences.library");
  const { data: result, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);

  const templates = result?.data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="bee-caption">{t("caption")}</p>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowNew((v) => !v);
          }}
          className="bee-btn bee-btn--primary shrink-0"
        >
          {t("newTemplate")}
        </button>
      </div>

      {showNew && <TemplateForm onDone={() => setShowNew(false)} />}
      {editing && <TemplateForm initial={editing} onDone={() => setEditing(null)} />}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
          <p className="bee-caption mt-1">{t("empty.subtitle")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="bee-bento bee-bento-pad">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <p className="text-sm font-semibold">{tpl.name}</p>
                </div>
                <Badge variant="outline">{t.has(`channels.${tpl.channel}`) ? t(`channels.${tpl.channel}`) : tpl.channel}</Badge>
              </div>
              {tpl.subject && (
                <p className="mt-2 truncate text-xs font-medium text-muted-foreground">{tpl.subject}</p>
              )}
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{tpl.body}</p>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowNew(false);
                    setEditing(tpl);
                  }}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 bee-micro transition-colors hover:bg-[var(--color-primary)]/40 hover:text-foreground"
                >
                  <Pencil className="size-3" />
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate.mutate(tpl.id)}
                  disabled={deleteTemplate.isPending}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 bee-micro transition-colors hover:bg-[var(--color-chart-2)]/20 hover:text-[var(--color-chart-2)]"
                >
                  <Trash2 className="size-3" />
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
