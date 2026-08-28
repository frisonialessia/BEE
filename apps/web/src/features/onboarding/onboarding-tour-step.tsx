"use client";

import Link from "next/link";
import { KanbanSquare, Lightbulb, Radio, Users, type LucideIcon } from "lucide-react";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
}

/** The order that actually tells BEE's story, not the nav rail's grouping
 * (Cuentas/Inteligencia/Operaciones, alphabetical-ish within each) — a
 * first-time visitor needs signal → pipeline → strategy → team, in that
 * order, before any of the other dozen sections make sense. */
const STEPS: Step[] = [
  {
    icon: Radio,
    title: "1. Señales",
    description: "Mirá qué detectó el mercado — funding, contrataciones clave, cambios de stack tecnológico.",
    href: "/dashboard/signals",
    cta: "Ver señales",
  },
  {
    icon: KanbanSquare,
    title: "2. Pipeline (CRM)",
    description: "Esas señales ya priorizadas en un pipeline — arrastrá una tarjeta para avanzarla de etapa.",
    href: "/dashboard/crm",
    cta: "Abrir pipeline",
  },
  {
    icon: Lightbulb,
    title: "3. Estrategia",
    description: "Abrí una oportunidad y mirá la jugada que armó la IA: argumento, canal, email y próximos pasos listos.",
    href: "/dashboard/strategies",
    cta: "Ver estrategias",
  },
  {
    icon: Users,
    title: "4. Equipo",
    description: "Invitá a tu equipo para que colabore en el mismo pipeline, con visibilidad según su rol.",
    href: "/dashboard/team",
    cta: "Invitar equipo",
  },
];

export function OnboardingTourStep({ onDone }: { onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="bee-display text-xl">Así funciona BEE</DialogTitle>
        <DialogDescription>
          Cuatro pasos, en el orden que recomendamos para tu primera vuelta. El resto del menú
          (Empresas, Pronóstico, Secuencias…) queda para cuando ya conozcas el loop principal.
        </DialogDescription>
      </DialogHeader>

      <ol className="mt-4 flex flex-col gap-3">
        {STEPS.map((step) => (
          <li
            key={step.href}
            className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] p-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
              <step.icon className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="bee-caption mt-0.5">{step.description}</p>
            </div>
            <Link
              href={step.href}
              onClick={onDone}
              className="bee-btn-ghost shrink-0 self-center px-2.5 py-1 text-xs"
            >
              {step.cta}
            </Link>
          </li>
        ))}
      </ol>

      <DialogFooter className="mt-2">
        <button type="button" onClick={onDone} className="bee-btn bee-btn--primary">
          Entendido, empezar
        </button>
      </DialogFooter>
    </>
  );
}
