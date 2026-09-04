"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { useCreateTemplate, useDeleteTemplate, useTemplates, useUpdateTemplate } from "@/hooks/queries/use-templates";
import type { MessageTemplate } from "@/lib/api/templates";

const CHANNELS = ["email", "linkedin", "other"] as const;

/** The template form in the "Nueva reunión" language: caption labels over
 *  grey inputs, the channel as pills, a footer with Cancelar and the
 *  primary save. */
function TemplateForm({ initial, onDone }: { initial?: MessageTemplate; onDone: () => void }) {
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
    const payload = { name: name.trim(), channel, subject: subject.trim() || undefined, body: body.trim() };
    if (initial) {
      await updateTemplate.mutateAsync({ id: initial.id, body: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    onDone();
  }

  return (
    <OverviewCard span={12} title={initial ? t("form.editTitle") : t("form.newTitle")} caption={t("form.caption")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("form.nameLabel")} required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("form.namePlaceholder")} required className="bee-input" />
          </Field>
          <div className="flex flex-col gap-1">
            <span className="bee-caption">{t("form.channelLabel")}</span>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <Pill key={c} pressed={channel === c} onClick={() => setChannel(c)}>
                  {t(`channels.${c}`)}
                </Pill>
              ))}
            </div>
          </div>
        </div>
        {channel === "email" && (
          <Field label={t("form.subjectLabel")}>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("form.subjectPlaceholder")} className="bee-input" />
          </Field>
        )}
        <Field label={t("form.bodyLabel")} required hint={t("form.bodyHint")}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("form.bodyPlaceholder")} required rows={4} className="bee-input" />
        </Field>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-divider)] pt-4">
          <button type="button" onClick={onDone} className="bee-btn-ghost">
            {t("form.cancel")}
          </button>
          <button type="submit" disabled={!name.trim() || !body.trim() || pending} className="bee-btn bee-btn--primary">
            {pending ? t("form.saving") : t("form.save")}
          </button>
        </div>
      </form>
    </OverviewCard>
  );
}

/** Biblioteca de mensajes reutilizables — el contenido con el que arrancar
 *  una secuencia, en vez de escribir desde cero cada vez: one card, one
 *  hairline row per template. Sin relación todavía con DynamicSequence; el
 *  siguiente paso natural es que un step pueda apuntar a una plantilla por id. */
export function MessageLibrary() {
  const t = useTranslations("workspace.sequences.library");
  const { data: result, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);

  const templates = result?.data ?? [];

  // Plain stack, not the grid: a form or a short list takes its own height.
  return (
    <div className="flex flex-col gap-6">
      {showNew && <TemplateForm onDone={() => setShowNew(false)} />}
      {editing && <TemplateForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}

      <OverviewCard
        span={12}
        title={t("title", { count: templates.length })}
        caption={t("caption")}
        action={
          <CardLink
            onClick={() => {
              setEditing(null);
              setShowNew((v) => !v);
            }}
          >
            {t("newTemplate")}
          </CardLink>
        }
      >
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : templates.length === 0 ? (
          <p className="bee-caption py-8 text-center">
            {t("empty.title")} {t("empty.subtitle")}
          </p>
        ) : (
          <div className="flex flex-col">
            {templates.map((tpl) => (
              <div key={tpl.id} className="bee-row items-start">
                <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs font-medium">
                  {t.has(`channels.${tpl.channel}`) ? t(`channels.${tpl.channel}`) : tpl.channel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {tpl.name}
                    {tpl.subject && <span className="text-[var(--color-text-muted)]"> · {tpl.subject}</span>}
                  </p>
                  <p className="bee-caption line-clamp-2">{tpl.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNew(false);
                      setEditing(tpl);
                    }}
                    className="bee-btn-text"
                  >
                    {t("edit")}
                  </button>
                  <button type="button" onClick={() => deleteTemplate.mutate(tpl.id)} disabled={deleteTemplate.isPending} className="bee-btn-text">
                    {t("delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </OverviewCard>
    </div>
  );
}
