"use client";

import { useState, type FormEvent } from "react";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPLOYEE_RANGES, type EmployeeRange } from "@/lib/api/organizations";
import { useUpdateOrganizationProfile } from "@/hooks/queries/use-organization-profile";

/** First onboarding step, shown only to OWNER/ADMIN and only while the
 * profile is still empty (see OnboardingIntro — it decides when to render
 * this vs. skipping straight to the guided tour). Deliberately asks for
 * employee_range only, not the full profile (industry/website) — those
 * live in Settings for whenever, this is the one field that's actually
 * used for segmentation later and worth asking for up front. */
export function CompanyProfileStep({ onDone }: { onDone: () => void }) {
  const updateProfile = useUpdateOrganizationProfile();
  const [employeeRange, setEmployeeRange] = useState<EmployeeRange | "">("");
  const [industry, setIndustry] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeRange) return;
    await updateProfile.mutateAsync({
      employee_range: employeeRange,
      industry: industry.trim() || undefined,
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="bee-display text-xl">Contanos de tu empresa</DialogTitle>
        <DialogDescription>
          Un dato rápido antes de arrancar — nos ayuda a mostrarte lo relevante para el tamaño de
          tu equipo. Podés cambiarlo después en Configuración.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div className="space-y-1.5">
          <label htmlFor="employeeRange" className="bee-caption block">
            ¿Cuántas personas trabajan en tu empresa? *
          </label>
          <select
            id="employeeRange"
            required
            value={employeeRange}
            onChange={(e) => setEmployeeRange(e.target.value as EmployeeRange)}
            className="bee-input"
          >
            <option value="" disabled>
              Elegí un rango
            </option>
            {EMPLOYEE_RANGES.map((range) => (
              <option key={range} value={range}>
                {range} empleados
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="industry" className="bee-caption block">
            Industria <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="bee-input"
            placeholder="Ej: B2B SaaS, Fintech, E-commerce"
          />
        </div>
      </div>

      <DialogFooter className="mt-2">
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Omitir por ahora
        </button>
        <button
          type="submit"
          disabled={!employeeRange || updateProfile.isPending}
          className="bee-btn bee-btn--primary"
        >
          {updateProfile.isPending ? "Guardando…" : "Continuar"}
        </button>
      </DialogFooter>
    </form>
  );
}
