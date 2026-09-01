"use client";

import { CheckCircle2, Radio, Sparkles, Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { useInView } from "@/hooks/use-in-view";

/**
 * MarketingHowItWorks — 4 pasos del flujo real de BEE, de señal a acción
 * aprobada, con fade-in-up al entrar en viewport (useInView + las clases
 * de tw-animate-css que ya trae el proyecto — sin librería de animación
 * nueva). Cada paso es una etapa real del pipeline (Motor de señales →
 * enriquecimiento → scoring → aprobación humana antes de cualquier envío),
 * no una simplificación de marketing: coincide con lo que describen
 * GUARANTEES y MODULES en app/page.tsx.
 */

const STEP_META = [
  { id: "detect", icon: Radio },
  { id: "enrich", icon: Sparkles },
  { id: "prepare", icon: Target },
  { id: "approve", icon: CheckCircle2 },
] as const;

function StepCard({
  step,
  index,
  title,
  description,
}: {
  step: (typeof STEP_META)[number];
  index: number;
  title: string;
  description: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <div
      ref={ref}
      className={`bee-bento bee-bento-pad relative transition-all duration-700 ease-out ${
        inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      style={{ transitionDelay: inView ? `${index * 120}ms` : "0ms" }}
    >
      <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
        <step.icon className="size-4.5 stroke-[1.5] text-[var(--color-chart-4)]" />
      </div>
      <h3 className="mt-3 text-sm font-semibold tracking-tight">{title}</h3>
      <p className="bee-caption mt-1.5">{description}</p>
      {/* Conector entre pasos — solo en desktop, oculto en el último. */}
      {index < STEP_META.length - 1 && (
        <div
          className="absolute right-[-1.1rem] top-1/2 hidden h-px w-6 -translate-y-1/2 bg-[var(--color-divider)] lg:block"
          aria-hidden
        />
      )}
    </div>
  );
}

export function MarketingHowItWorks() {
  const t = useTranslations("landing.howItWorks");

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEP_META.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            title={t(`steps.${step.id}.title`)}
            description={t(`steps.${step.id}.description`)}
          />
        ))}
      </div>
    </section>
  );
}
