"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Flame } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { scoreVariant } from "@/lib/format";

/**
 * MarketingBeforeAfter — mismas 6 empresas de ejemplo que el resto del
 * Demo en vivo (marketing-demo-panel.tsx), en dos estados: la lista cruda
 * sin BEE (sin score, sin orden, sin contexto — como llega un CSV
 * exportado del CRM) contra la misma lista priorizada por BEE (score,
 * badge de etapa, orden por intención). Mismo dataset en los dos lados a
 * propósito — el contraste tiene que venir de lo que BEE agrega, no de
 * comparar peras con manzanas.
 */

const COMPANIES = [
  "Northwind Robotics",
  "Vantage Health",
  "Solace Data",
  "Fielder Logistics",
  "Bright Path Analytics",
  "Anchor Freight",
] as const;

// Mismo orden que llegarían en un export crudo — alfabético, sin ningún
// criterio de prioridad.
const RAW_ROWS = [...COMPANIES].sort();

const SCORED_ROWS = [
  { company: "Northwind Robotics", score: 92, stage: "Listo para comprar" },
  { company: "Anchor Freight", score: 88, stage: "Listo para comprar" },
  { company: "Vantage Health", score: 78, stage: "Decisión" },
  { company: "Solace Data", score: 65, stage: "Consideración" },
  { company: "Bright Path Analytics", score: 58, stage: "Consideración" },
  { company: "Fielder Logistics", score: 41, stage: "Conocimiento" },
] as const;


export function MarketingBeforeAfter() {
  const [withBee, setWithBee] = useState(false);

  return (
    <section className="border-t border-border bg-[var(--color-primary)]/10">
      <div className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="bee-eyebrow">La misma lista, dos resultados</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Los mismos leads. La diferencia es qué haces primero.
          </h2>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="bee-filter-tabs">
            <button
              onClick={() => setWithBee(false)}
              className={`bee-filter-tab ${!withBee ? "bee-filter-tab--active" : ""}`}
            >
              Sin BEE
            </button>
            <button
              onClick={() => setWithBee(true)}
              className={`bee-filter-tab ${withBee ? "bee-filter-tab--active" : ""}`}
            >
              Con BEE
            </button>
          </div>
        </div>

        <div className="mt-6 bee-bento bee-bento-pad-lg">
          {!withBee ? (
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="size-3.5" />
                <span>Export sin procesar — orden alfabético, sin contexto de intención.</span>
              </div>
              <div className="divide-y divide-border">
                {RAW_ROWS.map((company) => (
                  <div key={company} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-muted-foreground">{company}</span>
                    <span className="bee-micro">— sin dato —</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-chart-4)]">
                <CheckCircle2 className="size-3.5" />
                <span>Priorizado por BEE — score de intención, etapa y qué atacar primero.</span>
              </div>
              <div className="divide-y divide-border">
                {SCORED_ROWS.map((row) => (
                  <div key={row.company} className="flex items-center justify-between py-2.5">
                    <span className="text-sm font-medium">{row.company}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{row.stage}</Badge>
                      <Badge variant={scoreVariant(row.score)} className="font-mono">
                        {row.score >= 80 && <Flame className="mr-0.5 size-2.5" />}
                        {row.score}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="bee-micro mt-4 flex items-center justify-center gap-1.5 text-center">
          {!withBee ? (
            <>
              Haz clic en <span className="font-medium text-foreground">&quot;Con BEE&quot;</span> para ver la
              misma lista priorizada <ArrowRight className="size-3" />
            </>
          ) : (
            "Vista ilustrativa — mismo criterio de score que el resto del Demo en vivo."
          )}
        </p>
      </div>
    </section>
  );
}
