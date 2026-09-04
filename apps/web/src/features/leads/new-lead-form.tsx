"use client";

import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { useCompanies, useCreateCompany } from "@/hooks/queries/use-companies";
import { useCreateLead } from "@/hooks/queries/use-leads";
import type { Company } from "@/types/domain";

/** The seniority tiers the rest of BEE already reasons about (see
 *  lib/relationship-map.ts's SeniorityTier and the automation builder's
 *  filter) — the CSV import passes whatever string the file says straight
 *  through, but a hand-typed lead can just pick from the known set. */
const SENIORITY_OPTIONS = ["c_level", "vp", "director", "manager", "ic"] as const;

/** Good-enough shape check — the backend re-validates; this only catches
 *  the obvious typo before a round trip. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** Same get-or-create rule the CSV import applies server-side: a company
 *  matches by domain when one is given, otherwise by name — both
 *  case-insensitive. */
function findExistingCompany(companies: Company[], name: string, domain: string): Company | undefined {
  const wantedName = name.trim().toLowerCase();
  const wantedDomain = normalizeDomain(domain);
  return companies.find((c) => {
    if (wantedDomain && c.domain && normalizeDomain(c.domain) === wantedDomain) return true;
    return c.name.trim().toLowerCase() === wantedName;
  });
}

const EMPTY_FORM = {
  nombre: "",
  correo: "",
  cargo: "",
  seniority: "",
  linkedin: "",
  telefono: "",
  empresa: "",
  dominio_empresa: "",
  industria: "",
  pais: "",
};

type FormState = typeof EMPTY_FORM;
type TextField = Exclude<keyof FormState, "seniority">;

/** "+ Nuevo lead" — the one-at-a-time counterpart to the CSV import: the
 *  same ten template columns (lead-import-panel.tsx's TEMPLATE_COLUMNS),
 *  the same company get-or-create by name/domain, then one POST /leads.
 *  Same visual language as NewCompanyForm in companies-list.tsx. */
export function NewLeadForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("companiesLeads.leadsDirectory.newLead");
  const listId = useId();
  const { data: companiesResult } = useCompanies(300);
  const createCompany = useCreateCompany();
  const createLead = useCreateLead();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [emailError, setEmailError] = useState<string | null>(null);

  const companies = useMemo(() => companiesResult?.data ?? [], [companiesResult]);
  const companyNames = useMemo(
    () => [...new Set(companies.map((c) => c.name))].sort((a, b) => a.localeCompare(b)),
    [companies],
  );

  const matchedCompany = useMemo(
    () => (form.empresa.trim() ? findExistingCompany(companies, form.empresa, form.dominio_empresa) : undefined),
    [companies, form.empresa, form.dominio_empresa],
  );

  const busy = createCompany.isPending || createLead.isPending;
  const canSubmit = form.nombre.trim().length > 0 && form.empresa.trim().length > 0 && !busy;

  function setField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "correo" && emailError) setEmailError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullName = form.nombre.trim();
    const companyName = form.empresa.trim();
    if (!fullName || !companyName) return;

    const email = form.correo.trim();
    if (email && !EMAIL_RE.test(email)) {
      setEmailError(t("errors.emailInvalid"));
      return;
    }

    try {
      // Reuse first, create second — an existing company is never
      // overwritten with what the form says (same rule as the import).
      const domain = normalizeDomain(form.dominio_empresa);
      const company =
        matchedCompany ??
        (await createCompany.mutateAsync({
          name: companyName,
          domain: domain || undefined,
          industry: form.industria.trim() || undefined,
          country: form.pais.trim() || undefined,
        }));

      await createLead.mutateAsync({
        full_name: fullName,
        company_id: company.id,
        email: email || undefined,
        title: form.cargo.trim() || undefined,
        seniority: form.seniority || undefined,
        linkedin_url: form.linkedin.trim() || undefined,
        phone: form.telefono.trim() || undefined,
      });

      toast.success(t("success", { name: fullName }));
      setForm(EMPTY_FORM);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("errors.createFailed"));
    }
  }

  function textField(
    field: TextField,
    opts: { type?: string; required?: boolean; list?: string; error?: string | null } = {},
  ) {
    const inputId = `${listId}-${field}`;
    return (
      <div className="min-w-0">
        <label htmlFor={inputId} className="bee-micro mb-1 block">
          {t(`fields.${field}`)}
          {opts.required ? " *" : ""}
        </label>
        <input
          id={inputId}
          type={opts.type ?? "text"}
          value={form[field]}
          onChange={(e) => setField(field, e.target.value)}
          placeholder={t(`placeholders.${field}`)}
          required={opts.required}
          list={opts.list}
          autoComplete="off"
          aria-invalid={opts.error ? true : undefined}
          className="bee-input"
        />
        {opts.error && <p className="mt-1 text-micro text-[var(--color-chart-2)]">{opts.error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="bee-bento bee-bento-pad mb-4 border-dashed">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("heading")}</p>
      <p className="bee-caption mt-1">{t("description")}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {textField("nombre", { required: true })}
        {textField("correo", { type: "email", error: emailError })}
        {textField("cargo")}
        <div className="min-w-0">
          <label htmlFor={`${listId}-seniority`} className="bee-micro mb-1 block">
            {t("fields.seniority")}
          </label>
          <select
            id={`${listId}-seniority`}
            value={form.seniority}
            onChange={(e) => setField("seniority", e.target.value)}
            className="bee-input"
          >
            <option value="">{t("seniorityNone")}</option>
            {SENIORITY_OPTIONS.map((tier) => (
              <option key={tier} value={tier}>
                {t(`seniorityOptions.${tier}`)}
              </option>
            ))}
          </select>
        </div>
        {textField("linkedin", { type: "url" })}
        {textField("telefono", { type: "tel" })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          {textField("empresa", { required: true, list: `${listId}-companies` })}
          <datalist id={`${listId}-companies`}>
            {companyNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="bee-micro mt-1">
            {form.empresa.trim() ? (matchedCompany ? t("companyExisting") : t("companyNew")) : t("companyHint")}
          </p>
        </div>
        {textField("dominio_empresa")}
        {textField("industria")}
        {textField("pais")}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={!canSubmit} className="bee-btn bee-btn--primary">
          {busy ? t("saving") : t("submit")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
