"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ACTION_PALETTE } from "@/components/sequences/action-palette";
import { Field, Pill } from "@/features/crm/drawer/primitives";

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
 *  se agrega al final de la cadena (ver SequenceEditor). In the "Nueva
 *  reunión" language: the action and the condition as toggle pills, the
 *  name and the notes as grey filled inputs, one help line. */
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="bee-caption font-medium uppercase tracking-wide">{t("stepComposer.title")}</p>

      <div className="flex flex-col gap-1">
        <span className="bee-caption">{t("stepComposer.actionLabel")}</span>
        <div className="flex flex-wrap gap-2">
          {ACTION_PALETTE.map((a) => (
            <Pill key={a.action} pressed={actionValue === a.action} onClick={() => handleActionChange(a.action)} title={t(`actions.${a.action}.description`)}>
              {t(`actions.${a.action}.label`)}
            </Pill>
          ))}
        </div>
        <span className="bee-micro">{t(`actions.${selectedAction.action}.description`)}</span>
      </div>

      <Field label={t("stepComposer.nameLabel")} required>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("stepComposer.namePlaceholder")} className="bee-input" />
      </Field>

      <div className="flex flex-col gap-1">
        <span className="bee-caption">{t("stepComposer.conditionLabel")}</span>
        <div className="flex flex-wrap gap-2">
          {conditions.map((c) => (
            <Pill
              key={c}
              pressed={!useCustom && condition === c}
              onClick={() => {
                setUseCustom(false);
                setCondition(c);
              }}
            >
              {t(`stepComposer.conditions.${c}`)}
            </Pill>
          ))}
          <Pill pressed={useCustom} onClick={() => setUseCustom(true)}>
            {t("stepComposer.advancedCondition")}
          </Pill>
        </div>
        {useCustom && (
          <>
            <input value={customCondition} onChange={(e) => setCustomCondition(e.target.value)} placeholder={t("stepComposer.customPlaceholder")} className="bee-input mt-1" />
            <span className="bee-micro">
              {t("stepComposer.customFormatPrefix")} <code>not_&lt;{t("stepComposer.customFormatEvent")}&gt;_&lt;N&gt;d</code>. {t("stepComposer.customFormatHelp")}
            </span>
          </>
        )}
      </div>

      <Field label={t("stepComposer.notesLabel")}>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("stepComposer.notesPlaceholder")} className="bee-input" />
      </Field>

      <div>
        <button type="submit" disabled={!name.trim()} className="bee-btn">
          {t("stepComposer.addButton")}
        </button>
      </div>
    </form>
  );
}
