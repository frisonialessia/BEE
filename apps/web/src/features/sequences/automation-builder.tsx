"use client";

import { ArrowLeft, Plus, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { FlowCanvas } from "@/components/sequences/flow-canvas";
import { StepComposer, type NewStepInput } from "@/components/sequences/step-composer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useChannelStatus,
  useCreateSequence,
  useSequence,
  useSequences,
} from "@/hooks/queries/use-sequences";
import type { Locale } from "@/i18n/locales";
import { getSignalTypeLabels } from "@/lib/format";
import { TIER_LABELS, type SeniorityTier } from "@/lib/relationship-map";
import type { SignalType } from "@/lib/types";
import type { StepDefinition } from "@/lib/api/sequences";

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

function ChannelStatusBadges() {
  const t = useTranslations("workspace.sequences.automation.channelStatus");
  const { data: statusResult } = useChannelStatus();
  const statuses = statusResult?.data ?? [];
  if (statuses.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {statuses.map((s) => (
        <Badge key={s.channel} variant={s.mock ? "outline" : "success"} className="text-micro">
          {s.channel}: {s.mock ? t("mock") : t("connected")}
        </Badge>
      ))}
    </div>
  );
}

function SequenceBuilder({ onSaved }: { onSaved: () => void }) {
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="bee-bento bee-bento-pad space-y-2">
          <p className="text-xs font-semibold">{t("config.title")}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("config.namePlaceholder")}
            className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("config.descriptionPlaceholder")}
            className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={signalType}
              onChange={(e) => setSignalType(e.target.value as SignalType | "")}
              className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              <option value="">{t("config.anySignal")}</option>
              {Object.entries(signalTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder={t("config.industryPlaceholder")}
              className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            />
            <select
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              className="col-span-2 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              <option value="">{t("config.anySeniority")}</option>
              {SENIORITY_OPTIONS.map((tier) => (
                <option key={tier} value={tier}>
                  {TIER_LABELS[tier]}
                </option>
              ))}
            </select>
          </div>
          <p className="bee-caption">{t("config.note")}</p>
          <ChannelStatusBadges />
        </div>

        <StepComposer onAdd={handleAdd} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || steps.length === 0 || createSequence.isPending}
            className="bee-btn bee-btn--primary text-xs"
          >
            {createSequence.isPending ? t("saving") : t("save")}
          </button>
          {createSequence.isError && (
            <p className="text-micro text-[var(--color-text)]">{t("saveError")}</p>
          )}
        </div>
      </div>

      <div>
        <p className="bee-eyebrow mb-2">{t("preview")}</p>
        <FlowCanvas steps={assembled} onRemoveStep={handleRemove} />
      </div>
    </div>
  );
}

function SequenceViewer({ sequenceId, onBack }: { sequenceId: string; onBack: () => void }) {
  const t = useTranslations("workspace.sequences.automation");
  const { data: seq, isLoading, isError } = useSequence(sequenceId);

  return (
    <div>
      <button type="button" onClick={onBack} className="bee-btn-ghost mb-4 text-xs">
        <ArrowLeft className="size-3.5" />
        {t("viewer.back")}
      </button>
      {isError ? (
        <p className="text-xs text-muted-foreground">{t("viewer.loadError")}</p>
      ) : isLoading || !seq ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{seq.name}</h3>
              {seq.description && <p className="bee-caption mt-1">{seq.description}</p>}
            </div>
            <Badge variant={seq.status === "active" ? "success" : "outline"}>{seq.status}</Badge>
          </div>
          <FlowCanvas steps={seq.steps} />
        </>
      )}
    </div>
  );
}

function SequenceList({ onSelect, onNew }: { onSelect: (id: string) => void; onNew: () => void }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("workspace.sequences.automation.list");
  const signalTypeLabels = getSignalTypeLabels(locale);
  const { data: seqResult, isLoading } = useSequences();
  const sequences = seqResult?.data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="bee-caption">{t("count", { count: sequences.length })}</p>
        <button type="button" onClick={onNew} className="bee-btn bee-btn--primary text-xs">
          <Plus className="size-3.5" />
          {t("newFlow")}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : sequences.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <Zap className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
          <p className="bee-caption mt-1">{t("empty.subtitle")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              type="button"
              onClick={() => onSelect(seq.id)}
              className="bee-bento bee-bento-pad text-left hover:border-[var(--color-chart-4)]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold">{seq.name}</p>
                <Badge variant={seq.status === "active" ? "success" : "outline"} className="text-micro">
                  {seq.status}
                </Badge>
              </div>
              <p className="bee-caption mt-1">
                {t("stepsCount", { count: seq.steps.length })}
                {seq.signal_type ? ` · ${signalTypeLabels[seq.signal_type as SignalType] ?? seq.signal_type}` : ""}
                {seq.industry ? ` · ${seq.industry}` : ""}
                {seq.seniority ? ` · ${TIER_LABELS[seq.seniority as SeniorityTier] ?? seq.seniority}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Automatizaciones — el workflow builder: diseña flujos multicanal
 *  (LinkedIn + email) como cadenas de pasos, encima del motor
 *  DynamicSequenceEngine que ya existe (DAG de estados, PendingAction por
 *  paso, aprobación del CEO antes de cualquier envío real). Este componente
 *  es solo la capa visual — la ejecución, el gate de aprobación y el
 *  mock/live de LinkedIn ya viven en el backend, sin cambios. */
export function AutomationBuilder() {
  const t = useTranslations("workspace.sequences.automation");
  const [view, setView] = useState<{ mode: "list" | "build" | "view"; sequenceId?: string }>({
    mode: "list",
  });

  if (view.mode === "build") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setView({ mode: "list" })}
          className="bee-btn-ghost mb-4 text-xs"
        >
          <ArrowLeft className="size-3.5" />
          {t("viewer.back")}
        </button>
        <SequenceBuilder onSaved={() => setView({ mode: "list" })} />
      </div>
    );
  }

  if (view.mode === "view" && view.sequenceId) {
    return <SequenceViewer sequenceId={view.sequenceId} onBack={() => setView({ mode: "list" })} />;
  }

  return (
    <SequenceList
      onSelect={(id) => setView({ mode: "view", sequenceId: id })}
      onNew={() => setView({ mode: "build" })}
    />
  );
}
