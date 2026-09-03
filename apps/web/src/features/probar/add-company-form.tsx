"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { EMPLOYEE_RANGES, type EmployeeRange } from "@/lib/api/organizations";
import { demoAddCompany } from "@/lib/demo/store";
import { queryKeys } from "@/lib/query-keys";

/** "Simula tu empresa" — see `app/probar/nav-items.ts` and
 * `lib/demo/templates.ts` for why it's named and framed this way (distinct
 * from the real Dashboard's "Cuéntanos de tu empresa" onboarding step and
 * its "+ Agregar empresa" prospect form). Lands on /probar/crm afterward so
 * the new card is immediately visible where it landed — "Detectada". */
export function AddCompanyForm() {
  const t = useTranslations("probar.addCompanyForm");
  const router = useRouter();
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
    router.push("/probar/crm");
    openOpportunity(opportunity.id);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="bee-btn bee-btn--primary">
        <Sparkles className="size-4" /> {t("trigger")}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bee-bento bee-bento-pad flex flex-wrap items-end gap-3">
      <div className="min-w-[10rem] flex-1 space-y-2">
        <label htmlFor="demoCompanyName" className="bee-caption block">
          {t("companyNameLabel")}
        </label>
        <input
          id="demoCompanyName"
          required
          // Deliberate: this form only renders after the user clicks the trigger button above to
          // open it — not a page-load steal-focus, the concern the rule exists for.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bee-input"
          placeholder={t("companyNamePlaceholder")}
        />
      </div>
      <div className="min-w-[10rem] space-y-2">
        <label htmlFor="demoEmployeeRange" className="bee-caption block">
          {t("employeesLabel")}
        </label>
        <select
          id="demoEmployeeRange"
          required
          value={employeeRange}
          onChange={(e) => setEmployeeRange(e.target.value as EmployeeRange)}
          className="bee-input"
        >
          <option value="" disabled>
            {t("employeesPlaceholder")}
          </option>
          {EMPLOYEE_RANGES.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="bee-btn bee-btn--primary">
        {t("submit")}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="bee-btn-ghost">
        {t("cancel")}
      </button>
    </form>
  );
}
