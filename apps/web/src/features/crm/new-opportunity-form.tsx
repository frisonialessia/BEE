"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useCreateOpportunity } from "@/hooks/queries/use-opportunities";
import { signalTypeLabels } from "@/lib/format";
import type { SignalType } from "@/types/domain";

const SIGNAL_TYPE_OPTIONS = Object.entries(signalTypeLabels) as [SignalType, string][];

const INPUT_CLASS =
  "rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]";

/**
 * Alta manual de una oportunidad — el "+ Nueva oportunidad" del CRM y de la
 * ficha de empresa. Un único formulario resuelve-o-crea la empresa y el
 * contacto (igual que la ingesta automática por señal) y dispara la misma
 * generación de estrategia con IA — ver `POST /opportunities`.
 *
 * `company`, cuando se pasa (desde la ficha de empresa), precarga y bloquea
 * los campos de empresa: ya sabemos exactamente cuál es, así que no tiene
 * sentido dejar que el nombre/dominio diverjan de lo que ya existe.
 */
export function NewOpportunityForm({
  company,
  onDone,
}: {
  company?: { name: string; domain: string | null };
  onDone: () => void;
}) {
  const createOpportunity = useCreateOpportunity();
  const [companyName, setCompanyName] = useState(company?.name ?? "");
  const [companyDomain, setCompanyDomain] = useState(company?.domain ?? "");
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [leadFullName, setLeadFullName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const [signalType, setSignalType] = useState<SignalType>("other");
  const [description, setDescription] = useState("");
  const [score, setScore] = useState(50);

  const companyLocked = Boolean(company);

  function reset() {
    setCompanyName(company?.name ?? "");
    setCompanyDomain(company?.domain ?? "");
    setCompanyIndustry("");
    setLeadFullName("");
    setLeadEmail("");
    setLeadTitle("");
    setSignalType("other");
    setDescription("");
    setScore(50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !description.trim()) return;
    try {
      await createOpportunity.mutateAsync({
        company_name: companyName.trim(),
        company_domain: companyDomain.trim() || undefined,
        company_industry: companyIndustry.trim() || undefined,
        lead_full_name: leadFullName.trim() || undefined,
        lead_email: leadEmail.trim() || undefined,
        lead_title: leadTitle.trim() || undefined,
        signal_type: signalType,
        description: description.trim(),
        score,
      });
      toast.success("Oportunidad agregada — generando su estrategia con IA…");
      reset();
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo crear la oportunidad — intenta de nuevo.",
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Nueva oportunidad
      </p>

      {!companyLocked && (
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Empresa *"
            required
            className={INPUT_CLASS}
          />
          <input
            value={companyDomain}
            onChange={(e) => setCompanyDomain(e.target.value)}
            placeholder="dominio.com"
            className={INPUT_CLASS}
          />
          <input
            value={companyIndustry}
            onChange={(e) => setCompanyIndustry(e.target.value)}
            placeholder="Industria"
            className={INPUT_CLASS}
          />
        </div>
      )}

      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={leadFullName}
          onChange={(e) => setLeadFullName(e.target.value)}
          placeholder="Contacto (opcional)"
          className={INPUT_CLASS}
        />
        <input
          value={leadTitle}
          onChange={(e) => setLeadTitle(e.target.value)}
          placeholder="Cargo"
          className={INPUT_CLASS}
        />
        <input
          value={leadEmail}
          onChange={(e) => setLeadEmail(e.target.value)}
          placeholder="Correo"
          type="email"
          className={INPUT_CLASS}
        />
      </div>

      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <select
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
          aria-label="Tipo de señal"
          className={INPUT_CLASS}
        >
          {SIGNAL_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className={`flex items-center gap-2 ${INPUT_CLASS}`}>
          <label htmlFor="new-opp-score" className="shrink-0 text-xs text-muted-foreground">
            Prioridad
          </label>
          <input
            id="new-opp-score"
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="accent-[var(--color-chart-4)]"
          />
          <span className="w-7 shrink-0 text-right font-mono text-xs tabular-nums">{score}</span>
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="¿Por qué es una oportunidad? Este contexto alimenta la estrategia que genera la IA. *"
        required
        rows={2}
        className={`w-full resize-none ${INPUT_CLASS}`}
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!companyName.trim() || !description.trim() || createOpportunity.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createOpportunity.isPending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
