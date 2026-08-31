"use client";

import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Mail,
  ListChecks,
  AlertTriangle,
  Zap,
} from "lucide-react";
import type { ArtifactBundle, ActionItem } from "@/lib/types";

interface ExecutionArtifactsProps {
  bundle: ArtifactBundle;
  opportunityId: string;
}

const priorityColors: Record<ActionItem["priority"], string> = {
  high: "border-[var(--color-chart-2)]",
  medium: "border-[var(--warning)]",
  low: "border-border",
};

const ownerLabels: Record<ActionItem["owner"], string> = {
  rep: "Tú",
  lead: "Lead",
  both: "Ambos",
};

const priorityLabels: Record<ActionItem["priority"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--bee-card-border)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-card)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="text-xs bg-[color-mix(in_srgb,var(--color-chart-6)_20%,var(--color-background))] text-[var(--color-chart-6)] px-2 py-0.5 rounded-sm font-medium">
              {badge}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export function ExecutionArtifacts({ bundle }: ExecutionArtifactsProps) {
  const { email_draft, meeting_structure, next_steps } = bundle;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-[var(--color-chart-6)]" />
        <h3 className="bee-card-title">
          Artefactos de ejecución
        </h3>
        <span className="text-xs text-muted-foreground">
          Generado por {bundle.generator}
        </span>
      </div>

      {/* Email Draft */}
      <CollapsibleSection
        title="Borrador de email"
        icon={Mail}
        defaultOpen={true}
        badge="Envío con un clic"
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Asunto</p>
              <p className="text-sm font-medium text-foreground">{email_draft.subject}</p>
            </div>
            <CopyButton text={email_draft.subject} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Cuerpo</p>
              <CopyButton
                text={
                  email_draft.body +
                  (email_draft.ps_line ? `\n\n${email_draft.ps_line}` : "")
                }
              />
            </div>
            <pre className="text-sm text-foreground bg-[var(--color-background)] rounded-sm p-3 whitespace-pre-wrap font-sans leading-relaxed border border-border">
              {email_draft.body}
            </pre>
            {email_draft.ps_line && (
              <p className="mt-2 text-sm text-muted-foreground italic pl-3 border-l-2 border-[var(--color-chart-6)]">
                {email_draft.ps_line}
              </p>
            )}
          </div>

          {email_draft.recommended_send_time && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Mejor momento para enviar: {email_draft.recommended_send_time}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Meeting Structure */}
      <CollapsibleSection
        title="Agenda de reunión"
        icon={Calendar}
        badge={`${meeting_structure.total_duration_minutes} min`}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Objetivo</p>
            <p className="text-sm text-foreground">{meeting_structure.objective}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Agenda</p>
            <div className="space-y-2">
              {meeting_structure.agenda_items.map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="min-w-[40px] text-xs text-muted-foreground pt-0.5">
                    {item.duration_minutes}m
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {meeting_structure.pre_meeting_prep.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Preparación previa</p>
              <ul className="space-y-1">
                {meeting_structure.pre_meeting_prep.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-[var(--success)] mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted-foreground rounded-sm p-2.5 border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,var(--color-background))]">
            <span className="font-medium text-[var(--success)]">Criterio de éxito: </span>
            {meeting_structure.success_criteria}
          </div>
        </div>
      </CollapsibleSection>

      {/* Next Steps */}
      <CollapsibleSection
        title="Plan de acción"
        icon={ListChecks}
        badge={next_steps.horizon}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            {next_steps.actions.map((action, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 text-xs rounded-sm border px-3 py-2 ${priorityColors[action.priority]}`}
              >
                <div className="flex-1">
                  <p className="font-medium">{action.action}</p>
                  <div className="flex items-center gap-2 mt-0.5 opacity-75">
                    <span>{ownerLabels[action.owner]}</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" />
                    <span>{action.timing}</span>
                  </div>
                </div>
                <span className="font-medium shrink-0">{priorityLabels[action.priority]}</span>
              </div>
            ))}
          </div>

          {next_steps.key_risk && (
            <div className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[color-mix(in_srgb,var(--warning)_15%,var(--color-background))] border border-[var(--warning)] rounded-sm p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">Riesgo clave: </span>
                {next_steps.key_risk}
              </div>
            </div>
          )}

          {next_steps.success_milestone && (
            <div className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[color-mix(in_srgb,var(--success)_15%,var(--color-background))] border border-[var(--success)] rounded-sm p-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">Hito de éxito: </span>
                {next_steps.success_milestone}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
