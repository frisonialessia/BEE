"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { StepComposer, type NewStepInput } from "@/components/sequences/step-composer";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { useChannelStatus, useCreateSequence } from "@/hooks/queries/use-sequences";
import type { Locale } from "@/i18n/locales";
import type { StepDefinition } from "@/lib/api/sequences";
import { getSignalTypeLabels } from "@/lib/format";
import { TIER_LABELS, type SeniorityTier } from "@/lib/relationship-map";
import type { SignalType } from "@/lib/types";

import { SequenceTimeline } from "./sequence-timeline";

const SENIORITY_OPTIONS: SeniorityTier[] = ["c_level", "vp", "director", "manager", "ic"];

interface LocalStep {
  id: string;
  name: string;
  action: string;
  channel: string;
  notes: string;
  condition: string;
}

/** Arma la lista de LocalStep en el arreglo StepDefinition que el backend
 *  espera — cada paso transiciona al siguiente con la condición que se le
 *  configuró; el último cierra la secuencia (`next_step_id: null`) con su
 *  propia condición. */
function assembleSteps(local: LocalStep[]): StepDefinition[] {
  return local.map((step, i) => {
    const next = local[i + 1];
    return {
      id: step.id,
      name: step.name,
      action: step.action,
      channel: step.channel,
      notes: step.notes || null,
      transitions: [{ condition: step.condition, next_step_id: next?.id ?? null, delay_days: 0 }],
      max_wait_days: 7,
    };
  });
}

/** Estado real de autenticación por canal — mock vs conectado, directo de
 *  OmnichannelGateway.check_auth(). Never invents "connected". */
function ChannelStatusLine() {
  const t = useTranslations("workspace.sequences.automation.channelStatus");
  const { data: statusResult } = useChannelStatus();
  const statuses = statusResult?.data ?? [];
  if (statuses.length === 0) return null;
  return <p className="bee-micro">{statuses.map((s) => `${s.channel}: ${s.mock ? t("mock") : t("connected")}`).join(" · ")}</p>;
}

/**
 * Nueva secuencia — the builder in the "Nueva reunión" language: caption
 * labels over grey filled inputs, the signal and the seniority as toggle
 * pills, the step composer beside a live timeline of the flow, and a
 * footer with Cancelar and the primary save. Sits on top of the
 * DynamicSequenceEngine that already exists (state DAG, one PendingAction
 * per step, the CEO's approval before anything real goes out) — this is
 * only the visual layer.
 */
export function SequenceEditor({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("workspace.sequences.automation");
  const signalTypeLabels = getSignalTypeLabels(locale);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [signalType, setSignalType] = useState<SignalType | "">("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("");
  const [steps, setSteps] = useState<LocalStep[]>([]);
  const createSequence = useCreateSequence();

  const assembled = assembleSteps(steps);

  function handleAdd(input: NewStepInput) {
    setSteps((prev) => [...prev, { id: `s${prev.length + 1}`, ...input }]);
  }

  function handleRemove(stepId: string) {
    setSteps((prev) => prev.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, id: `s${i + 1}` })));
  }

  async function handleSave() {
    if (!name.trim() || steps.length === 0) return;
    await createSequence.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      signal_type: signalType || undefined,
      industry: industry.trim() || undefined,
      seniority: seniority || undefined,
      entry_step_id: "s1",
      steps: assembled,
      max_days: 30,
    });
    onSaved();
  }

  return (
    <OverviewCard span={12} title={t("editor.title")} caption={t("editor.caption")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <p className="bee-caption font-medium uppercase tracking-wide">{t("config.title")}</p>
          <Field label={t("config.nameLabel")} required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("config.namePlaceholder")} className="bee-input" />
          </Field>
          <Field label={t("config.descriptionLabel")}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("config.descriptionPlaceholder")} className="bee-input" />
          </Field>
          <div className="flex flex-col gap-1">
            <span className="bee-caption">{t("config.signalLabel")}</span>
            <div className="flex flex-wrap gap-2">
              <Pill pressed={signalType === ""} onClick={() => setSignalType("")}>
                {t("config.anySignal")}
              </Pill>
              {Object.entries(signalTypeLabels).map(([value, label]) => (
                <Pill key={value} pressed={signalType === value} onClick={() => setSignalType(value as SignalType)}>
                  {label}
                </Pill>
              ))}
            </div>
          </div>
          <Field label={t("config.industryLabel")}>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder={t("config.industryPlaceholder")} className="bee-input" />
          </Field>
          <div className="flex flex-col gap-1">
            <span className="bee-caption">{t("config.seniorityLabel")}</span>
            <div className="flex flex-wrap gap-2">
              <Pill pressed={seniority === ""} onClick={() => setSeniority("")}>
                {t("config.anySeniority")}
              </Pill>
              {SENIORITY_OPTIONS.map((tier) => (
                <Pill key={tier} pressed={seniority === tier} onClick={() => setSeniority(tier)}>
                  {TIER_LABELS[tier]}
                </Pill>
              ))}
            </div>
            <span className="bee-micro">{t("config.note")}</span>
          </div>
          <ChannelStatusLine />
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--color-divider)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <p className="bee-caption mb-2 font-medium uppercase tracking-wide">{t("preview")}</p>
            <SequenceTimeline steps={assembled} onRemoveStep={handleRemove} />
          </div>
          <div className="border-t border-[var(--color-divider)] pt-4">
            <StepComposer onAdd={handleAdd} />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-divider)] pt-4">
        {createSequence.isError && <p className="bee-caption mr-auto">{t("saveError")}</p>}
        <button type="button" onClick={onCancel} className="bee-btn-ghost">
          {t("editor.cancel")}
        </button>
        <button type="button" onClick={handleSave} disabled={!name.trim() || steps.length === 0 || createSequence.isPending} className="bee-btn bee-btn--primary">
          {createSequence.isPending ? t("saving") : t("save")}
        </button>
      </div>
    </OverviewCard>
  );
}
