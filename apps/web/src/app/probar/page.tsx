"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

import { CrmView } from "@/features/crm/crm-view";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { SignalsDashboard } from "@/features/signals/signals-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMPLOYEE_RANGES, type EmployeeRange } from "@/lib/api/organizations";
import { demoAddCompany } from "@/lib/demo/store";
import { queryKeys } from "@/lib/query-keys";

function AddCompanyForm() {
  const queryClient = useQueryClient();
  const { openOpportunity } = useOpportunityDrawer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [employeeRange, setEmployeeRange] = useState<EmployeeRange | "">("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !employeeRange) return;
    const opportunity = demoAddCompany(name.trim(), employeeRange);
    // Both queries read from lib/demo/store, not the network — invalidating
    // just tells TanStack Query to re-read it now instead of on next focus.
    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.signals.all });
    setName("");
    setEmployeeRange("");
    setOpen(false);
    openOpportunity(opportunity.id);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="bee-btn bee-btn--primary">
        <Sparkles className="size-4" /> Simula tu empresa
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bee-bento bee-bento-pad flex flex-wrap items-end gap-3">
      <div className="min-w-[10rem] flex-1 space-y-1.5">
        <label htmlFor="demoCompanyName" className="bee-caption block">
          Nombre de tu empresa
        </label>
        <input
          id="demoCompanyName"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bee-input"
          placeholder="Ej: Acme Inc"
        />
      </div>
      <div className="min-w-[10rem] space-y-1.5">
        <label htmlFor="demoEmployeeRange" className="bee-caption block">
          Empleados
        </label>
        <select
          id="demoEmployeeRange"
          required
          value={employeeRange}
          onChange={(e) => setEmployeeRange(e.target.value as EmployeeRange)}
          className="bee-input"
        >
          <option value="" disabled>
            Elige un rango
          </option>
          {EMPLOYEE_RANGES.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="bee-btn bee-btn--primary">
        Generar señal
      </button>
      <button type="button" onClick={() => setOpen(false)} className="bee-btn-ghost">
        Cancelar
      </button>
    </form>
  );
}

/** The sandbox's core loop: see the signals BEE detects, then see how they
 * become a working pipeline. Strategy/battlecard detail lives one click
 * away, in the opportunity drawer, same as the real product — see
 * `probar/layout.tsx` for why this can reuse those components unmodified.
 * "Simula tu empresa" is the one way new data enters — named deliberately
 * differently from the real Dashboard's onboarding "Cuéntanos de tu
 * empresa" step (an account-profile field) and from the real Dashboard's
 * "+ Agregar empresa" (adding a tracked prospect) — three different
 * actions that all touch the words "tu empresa", so each needed its own
 * distinct phrasing. See `lib/demo/templates.ts` for why this one is an
 * honest self-referential signal, not an invented event about the
 * visitor's real company. */
export default function ProbarPage() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Sandbox</p>
        <h1 className="bee-display">Así ve BEE tu mercado</h1>
        <p className="bee-caption mt-1">
          Señales detectadas → pipeline priorizado → estrategia lista para ejecutar.
          Arrastra una tarjeta o ábrela para ver el battlecard generado.
        </p>
        <div className="mt-4">
          <AddCompanyForm />
        </div>
      </header>

      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">Señales</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>
        <TabsContent value="signals" className="mt-6">
          <SignalsDashboard />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-6">
          <CrmView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
