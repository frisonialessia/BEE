"use client";

import { AlertCircle, Check, Download, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useImportLeads } from "@/hooks/queries/use-leads";
import { downloadCsv, parseCsv, pickColumn, toCsv } from "@/lib/csv";
import { parseXlsxFile } from "@/lib/xlsx-import";
import type { LeadImportRow } from "@/lib/api/leads";
import { cn } from "@/lib/utils";

// ── Plantilla ────────────────────────────────────────────────────────────

const TEMPLATE_COLUMNS: { key: string; header: string }[] = [
  { key: "nombre", header: "nombre" },
  { key: "correo", header: "correo" },
  { key: "cargo", header: "cargo" },
  { key: "seniority", header: "seniority" },
  { key: "linkedin", header: "linkedin" },
  { key: "telefono", header: "telefono" },
  { key: "empresa", header: "empresa" },
  { key: "dominio_empresa", header: "dominio_empresa" },
  { key: "industria", header: "industria" },
  { key: "pais", header: "pais" },
];

const TEMPLATE_EXAMPLE_ROW: Record<string, string> = {
  nombre: "Jane Doe",
  correo: "jane@ejemplo.com",
  cargo: "VP Ventas",
  seniority: "vp",
  linkedin: "https://linkedin.com/in/janedoe",
  telefono: "+52 555 123 4567",
  empresa: "Ejemplo SA",
  dominio_empresa: "ejemplo.com",
  industria: "software",
  pais: "México",
};

function downloadTemplate() {
  const csv = toCsv([TEMPLATE_EXAMPLE_ROW], TEMPLATE_COLUMNS);
  downloadCsv("bee-plantilla-prospectos.csv", csv);
}

// ── Mapeo flexible de columnas (español/inglés, variantes comunes) ────────

function mapRow(row: Record<string, string>): LeadImportRow {
  return {
    full_name: pickColumn(row, ["full_name", "nombre", "nombre completo", "name", "contacto"]),
    email: pickColumn(row, ["email", "correo", "correo electrónico", "correo electronico", "e-mail"]),
    title: pickColumn(row, ["title", "cargo", "puesto", "posición", "posicion"]),
    seniority: pickColumn(row, ["seniority", "nivel", "antigüedad", "antiguedad"]),
    linkedin_url: pickColumn(row, ["linkedin_url", "linkedin", "perfil linkedin", "perfil de linkedin"]),
    phone: pickColumn(row, ["phone", "telefono", "teléfono", "celular"]),
    company_name: pickColumn(row, ["company_name", "empresa", "compañía", "compania", "company"]),
    company_domain: pickColumn(row, ["company_domain", "dominio_empresa", "dominio", "domain", "sitio web", "website"]),
    company_industry: pickColumn(row, ["company_industry", "industria", "industry", "sector"]),
    company_country: pickColumn(row, ["company_country", "pais", "país", "country"]),
  };
}

/** Misma regla que el backend (`import_leads`) usa para decidir si una fila
 *  tiene algo con qué identificar un lead — el preview nunca promete
 *  importar más filas de las que realmente van a entrar. */
function isImportable(row: LeadImportRow): boolean {
  return Boolean(row.full_name?.trim() || row.email?.trim());
}

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const isExcel = /\.xlsx?$/i.test(file.name);
  if (isExcel) return parseXlsxFile(file);
  const text = await file.text();
  return parseCsv(text);
}

/** One step of the panel: a caption label, one line of help, the control. */
function Step({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-[var(--color-divider)] pt-4 first:border-t-0 first:pt-0", className)}>
      <p className="bee-caption font-medium uppercase tracking-wide">{label}</p>
      {hint && <p className="bee-micro mt-1">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────

/** Importar prospectos — the side panel in the "Nueva reunión" language:
 *  three hairline-divided steps (template, file, preview), one help line
 *  each, the footer with Cancelar (ghost) and the primary import. */
export function LeadImportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("companiesLeads.leadImportPanel");
  const [rows, setRows] = useState<LeadImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportLeads();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const importable = rows.filter(isImportable);
  const result = importMutation.data;

  async function ingestFile(file: File) {
    setParseError(null);
    importMutation.reset();
    if (!/\.(csv|xlsx?)$/i.test(file.name)) {
      setParseError(t("step2.unsupportedFormat"));
      setRows([]);
      setFileName(null);
      return;
    }
    try {
      const parsed = await parseFile(file);
      setRows(parsed.map(mapRow));
      setFileName(file.name);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t("step2.readError"));
      setRows([]);
      setFileName(null);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await ingestFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLElement>) {
    // relatedTarget is null when the pointer leaves the window entirely, and
    // otherwise fires on every child hand-off within the drop zone — only
    // clear the state once the pointer has actually left the zone itself.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await ingestFile(file);
  }

  function handleReset() {
    setRows([]);
    setFileName(null);
    setParseError(null);
    importMutation.reset();
  }

  return (
    <>
      <button type="button" className="bee-drawer-overlay" aria-label={t("closeAria")} onClick={onClose} />
      <aside className="bee-drawer" role="dialog" aria-modal="true" aria-label={t("panelAria")}>
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-divider)] px-6 py-4">
          <div className="min-w-0">
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h2 className="bee-card-title mt-1 !mb-0 truncate">{t("heading")}</h2>
          </div>
          <button type="button" onClick={onClose} className="bee-btn-ghost bee-btn--icon" aria-label={t("closeButtonAria")}>
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
          <Step label={t("step1.title")} hint={t("step1.description")}>
            <button type="button" onClick={downloadTemplate} className="bee-btn-ghost">
              <Download className="size-3.5" />
              {t("step1.downloadButton")}
            </button>
          </Step>

          <Step label={t("step2.title")} hint={t("step2.description")}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
                HTML5 drag-and-drop has no keyboard equivalent by design; the button inside opens
                the same native file picker for keyboard/screen-reader users. */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] p-4 transition-colors",
                isDragging && "bg-[var(--color-primary)]",
              )}
            >
              <button type="button" onClick={() => inputRef.current?.click()} className="bee-btn-ghost">
                <Upload className="size-3.5" />
                {isDragging ? t("step2.dropReady") : t("step2.chooseFile")}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => void handleFile(e)}
                className="hidden"
              />
              {fileName && (
                <p className="bee-micro">
                  {fileName} · {t("step2.rowsRead", { count: rows.length })}
                  {importable.length < rows.length && ` · ${t("step2.rowsSkipped", { count: rows.length - importable.length })}`}
                </p>
              )}
              {parseError && (
                <p className="flex items-center gap-2 text-sm">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {parseError}
                </p>
              )}
            </div>
          </Step>

          {rows.length > 0 && (
            <Step label={t("step3.title")}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="bee-caption border-b border-[var(--color-divider)] py-1.5 pr-2 font-medium uppercase tracking-wide">{t("step3.headers.name")}</th>
                      <th className="bee-caption border-b border-[var(--color-divider)] px-2 py-1.5 font-medium uppercase tracking-wide">{t("step3.headers.email")}</th>
                      <th className="bee-caption border-b border-[var(--color-divider)] px-2 py-1.5 font-medium uppercase tracking-wide">{t("step3.headers.company")}</th>
                      <th className="border-b border-[var(--color-divider)] py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-[var(--color-divider)] last:border-b-0">
                        <td className="max-w-40 truncate py-2 pr-2">{row.full_name || "—"}</td>
                        <td className="max-w-40 truncate px-2 py-2">{row.email || "—"}</td>
                        <td className="max-w-32 truncate px-2 py-2">{row.company_name || "—"}</td>
                        <td className="py-2 pl-2 text-right">
                          {isImportable(row) ? <Check className="inline size-3.5 text-[var(--color-text)]" aria-label="OK" /> : <AlertCircle className="inline size-3.5 text-[var(--color-text-muted)]" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="bee-caption mt-2">{t("step3.moreRows", { count: rows.length - 8 })}</p>}
            </Step>
          )}

          {result && (
            <Step label={t("result.title")}>
              <p className="text-sm">
                {t("result.newLeads", { count: result.leads_created })} · {t("result.matchedLeads", { count: result.leads_matched })} · {t("result.newCompanies", { count: result.companies_created })}
                {result.companies_matched > 0 && ` · ${t("result.reusedCompanies", { count: result.companies_matched })}`}
                {result.skipped > 0 && ` · ${t("result.skippedRows", { count: result.skipped })}`}
              </p>
              {result.rows.some((r) => r.status === "error") && (
                <ul className="mt-2 space-y-1">
                  {result.rows
                    .filter((r) => r.status === "error")
                    .slice(0, 10)
                    .map((r) => (
                      <li key={r.row} className="bee-caption">
                        {t("result.rowError", { row: r.row + 1, message: r.message ?? "" })}
                      </li>
                    ))}
                </ul>
              )}
            </Step>
          )}

          {importMutation.isError && (
            <p className="flex items-center gap-2 text-sm">
              <AlertCircle className="size-3.5 shrink-0" />
              {t("importError")}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-divider)] px-6 py-4">
          {rows.length > 0 && (
            <button type="button" onClick={handleReset} className="bee-btn-text mr-auto">
              {t("actions.startOver")}
            </button>
          )}
          <button type="button" onClick={onClose} className="bee-btn-ghost">
            {t("actions.cancel")}
          </button>
          <button type="button" disabled={importable.length === 0 || importMutation.isPending} onClick={() => importMutation.mutate(importable)} className="bee-btn bee-btn--primary">
            {importMutation.isPending ? t("actions.importing") : t("actions.importLeads", { count: importable.length })}
          </button>
        </div>
      </aside>
    </>
  );
}
