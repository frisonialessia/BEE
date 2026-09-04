"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ACTION_PALETTE } from "@/components/sequences/action-palette";

const CONDITIONS_BY_CHANNEL: Record<string, string[]> = {
  email: ["opened", "clicked", "replied", "no_response"],
  linkedin: ["accepted", "replied", "no_response"],
};

export interface NewStepInput {
  name: string;
  action: string;
  channel: string;
  notes: string;
  condition: string;
}

/** Formulario para agregar un paso nuevo al flujo — un solo paso a la vez,
 *  se agrega al final de la cadena (ver SequenceBuilder). */
export function StepComposer({ onAdd }: { onAdd: (step: NewStepInput) => void }) {
  const t = useTranslations("workspace.sequences");
  const [actionValue, setActionValue] = useState(ACTION_PALETTE[0].action);
  const [name, setName] = useState(t(`actions.${ACTION_PALETTE[0].action}.label`));
  const [notes, setNotes] = useState("");
  const [condition, setCondition] = useState(CONDITIONS_BY_CHANNEL.email[0]);
  const [customCondition, setCustomCondition] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const selectedAction = ACTION_PALETTE.find((a) => a.action === actionValue) ?? ACTION_PALETTE[0];
  const conditions = CONDITIONS_BY_CHANNEL[selectedAction.channel] ?? CONDITIONS_BY_CHANNEL.email;

  function handleActionChange(value: string) {
    const def = ACTION_PALETTE.find((a) => a.action === value) ?? ACTION_PALETTE[0];
    setActionValue(value);
    setName(t(`actions.${def.action}.label`));
    const opts = CONDITIONS_BY_CHANNEL[def.channel] ?? CONDITIONS_BY_CHANNEL.email;
    setCondition(opts[0]);
    setUseCustom(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      action: actionValue,
      channel: selectedAction.channel,
      notes: notes.trim(),
      condition: useCustom ? customCondition.trim() || "no_response" : condition,
    });
    setNotes("");
  }

  return (
    <form onSubmit={handleSubmit} className="bee-bento bee-bento-pad space-y-2">
      <p className="text-xs font-semibold">{t("stepComposer.title")}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={actionValue}
          onChange={(e) => handleActionChange(e.target.value)}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
        >
          {ACTION_PALETTE.map((a) => (
            <option key={a.action} value={a.action}>
              {t(`actions.${a.action}.label`)}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("stepComposer.namePlaceholder")}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <select
            value={useCustom ? "__custom" : condition}
            onChange={(e) => {
              if (e.target.value === "__custom") setUseCustom(true);
              else {
                setUseCustom(false);
                setCondition(e.target.value);
              }
            }}
            className="flex-1 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
          >
            {conditions.map((c) => (
              <option key={c} value={c}>
                {t(`stepComposer.conditions.${c}`)}
              </option>
            ))}
            <option value="__custom">{t("stepComposer.advancedCondition")}</option>
          </select>
        </div>
        {useCustom && (
          <>
            <input
              value={customCondition}
              onChange={(e) => setCustomCondition(e.target.value)}
              placeholder={t("stepComposer.customPlaceholder")}
              className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            />
            <p className="bee-micro">
              {t("stepComposer.customFormatPrefix")} <code>not_&lt;{t("stepComposer.customFormatEvent")}&gt;_&lt;N&gt;d</code>.{" "}
              {t("stepComposer.customFormatHelp")}
            </p>
          </>
        )}
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("stepComposer.notesPlaceholder")}
        className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
      />

      <button type="submit" disabled={!name.trim()} className="bee-btn bee-btn--primary text-xs">
        <Plus className="size-3.5" />
        {t("stepComposer.addButton")}
      </button>
    </form>
  );
}
