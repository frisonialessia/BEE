import { Flag, X } from "lucide-react";

import { ACTION_BY_VALUE, CHANNEL_COLOR, CHANNEL_ICON } from "@/components/sequences/action-palette";
import type { StepDefinition } from "@/lib/api/sequences";

const CONDITION_LABEL: Record<string, string> = {
  opened: "cuando abren",
  clicked: "cuando hacen clic",
  replied: "cuando responden",
  accepted: "cuando aceptan",
  no_response: "sin respuesta",
};

function describeCondition(condition: string): string {
  if (CONDITION_LABEL[condition]) return CONDITION_LABEL[condition];
  const timeout = /^not_(.+)_(\d+)d$/.exec(condition);
  if (timeout) {
    const [, event, days] = timeout;
    return `si no hay "${event}" en ${days} día${days === "1" ? "" : "s"}`;
  }
  return condition;
}

/** Canvas visual del flujo — cadena vertical de pasos conectados, cada uno
 *  con su acción/canal y la condición real que el motor evalúa para avanzar
 *  (`DynamicSequenceEngine.advance`, vía `POST .../executions/{id}/advance`).
 *  Solo lectura: sirve tanto para previsualizar mientras se arma el flujo
 *  como para ver uno ya guardado. Asume una cadena principalmente lineal —
 *  el orden del arreglo `steps` es el orden visual — que es exactamente la
 *  forma que produce el builder (ver SequenceBuilder). */
export function FlowCanvas({
  steps,
  onRemoveStep,
}: {
  steps: StepDefinition[];
  onRemoveStep?: (stepId: string) => void;
}) {
  if (steps.length === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-10 text-center">
        <p className="text-sm text-muted-foreground">Todavía no hay pasos en este flujo.</p>
        <p className="bee-caption mt-1">Agrega el primero desde la paleta de acciones.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-1">
      {steps.map((step, i) => {
        const def = ACTION_BY_VALUE[step.action];
        const Icon = def?.icon;
        const channel = step.channel ?? def?.channel ?? "email";
        const ChannelIcon = CHANNEL_ICON[channel];
        const color = CHANNEL_COLOR[channel] ?? "var(--color-chart-6)";
        const primaryTransition = step.transitions[0];
        const isLast = i === steps.length - 1;

        return (
          <div key={step.id} className="relative">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: color,
                    background: `color-mix(in srgb, ${color} 18%, var(--color-background))`,
                    boxShadow: `0 0 12px 0 color-mix(in srgb, ${color} 35%, transparent)`,
                  }}
                >
                  {Icon && <Icon className="size-4" style={{ color }} />}
                </span>
                {!isLast && (
                  <span
                    className="mt-1 w-px flex-1"
                    style={{
                      minHeight: "2.75rem",
                      background: `linear-gradient(to bottom, ${color}, color-mix(in srgb, ${color} 20%, transparent))`,
                    }}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-7">
                <div className="bee-bento bee-bento-pad flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {ChannelIcon && <ChannelIcon className="size-3 shrink-0 text-muted-foreground" />}
                      <p className="truncate text-xs font-semibold">{step.name}</p>
                    </div>
                    <p className="bee-caption mt-0.5">{def?.description ?? step.action}</p>
                    {step.notes && <p className="mt-1 bee-micro">{step.notes}</p>}
                  </div>
                  {onRemoveStep && (
                    <button
                      type="button"
                      onClick={() => onRemoveStep(step.id)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-[var(--color-primary)]"
                      aria-label="Quitar paso"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {!isLast && primaryTransition && (
                  <p className="mt-1.5 pl-1 bee-micro">
                    → avanza {describeCondition(primaryTransition.condition)}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
          <Flag className="size-4 text-muted-foreground" />
        </span>
        <p className="bee-caption">Fin de la secuencia</p>
      </div>
    </div>
  );
}
