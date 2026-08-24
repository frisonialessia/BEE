"use client";

import { AlertCircle, CheckCircle2, Download, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useImportLeads } from "@/hooks/queries/use-leads";
import { downloadCsv, parseCsv, pickColumn, toCsv } from "@/lib/csv";
import { parseXlsxFile } from "@/lib/xlsx-import";
import type { LeadImportRow } from "@/lib/api/leads";

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

// ── Panel ────────────────────────────────────────────────────────────────

export function LeadImportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<LeadImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParseError(null);
    importMutation.reset();
    try {
      const parsed = await parseFile(file);
      setRows(parsed.map(mapRow));
      setFileName(file.name);
    } catch {
      setParseError("No se pudo leer el archivo — confirma que sea un .csv o .xlsx válido.");
      setRows([]);
      setFileName(null);
    }
  }

  function handleReset() {
    setRows([]);
    setFileName(null);
    setParseError(null);
    importMutation.reset();
  }

  return (
    <>
      <button
        type="button"
        className="bee-drawer-overlay"
        aria-label="Cerrar importación de prospectos"
        onClick={onClose}
      />
      <aside className="bee-drawer" role="dialog" aria-modal="true" aria-label="Importar prospectos">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <p className="bee-eyebrow">Carga inteligente</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Importar prospectos</h2>
          </div>
          <button type="button" onClick={onClose} className="bee-btn-ghost" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <section className="bee-bento bee-bento-pad space-y-2">
            <p className="text-xs font-semibold">1. Descarga la plantilla</p>
            <p className="bee-caption">
              Nombre, correo, cargo, seniority, LinkedIn, teléfono, empresa, dominio, industria y país —
              solo el nombre o el correo son obligatorios por fila.
            </p>
            <button type="button" onClick={downloadTemplate} className="bee-btn-ghost text-xs">
              <Download className="size-3.5" />
              Descargar plantilla .csv
            </button>
          </section>

          <section className="bee-bento bee-bento-pad space-y-2">
            <p className="text-xs font-semibold">2. Sube tu archivo (.csv o .xlsx)</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="bee-btn-ghost text-xs"
            >
              <Upload className="size-3.5" />
              Elegir archivo
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
              className="hidden"
            />
            {fileName && (
              <p className="bee-micro">
                {fileName} · {rows.length} fila{rows.length === 1 ? "" : "s"} leída
                {rows.length === 1 ? "" : "s"}
                {importable.length < rows.length &&
                  ` · ${rows.length - importable.length} sin nombre ni correo (no se importarán)`}
              </p>
            )}
            {parseError && (
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-chart-2)]">
                <AlertCircle className="size-3.5 shrink-0" />
                {parseError}
              </p>
            )}
          </section>

          {rows.length > 0 && (
            <section className="bee-bento bee-bento-pad space-y-2">
              <p className="text-xs font-semibold">3. Vista previa</p>
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--color-muted)]/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Nombre</th>
                      <th className="px-2 py-1.5 font-medium">Correo</th>
                      <th className="px-2 py-1.5 font-medium">Empresa</th>
                      <th className="px-2 py-1.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5">{row.full_name || "—"}</td>
                        <td className="px-2 py-1.5">{row.email || "—"}</td>
                        <td className="px-2 py-1.5">{row.company_name || "—"}</td>
                        <td className="px-2 py-1.5">
                          {isImportable(row) ? (
                            <CheckCircle2 className="size-3.5 text-[var(--success)]" />
                          ) : (
                            <AlertCircle className="size-3.5 text-muted-foreground" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && (
                <p className="bee-caption">+{rows.length - 8} fila{rows.length - 8 === 1 ? "" : "s"} más</p>
              )}
            </section>
          )}

          {result && (
            <section className="bee-bento bee-bento-pad space-y-1.5">
              <p className="text-xs font-semibold">Resultado</p>
              <p className="bee-micro">
                {result.leads_created} lead{result.leads_created === 1 ? "" : "s"} nuevo
                {result.leads_created === 1 ? "" : "s"} · {result.leads_matched} ya existía
                {result.leads_matched === 1 ? "" : "n"} (fusionado{result.leads_matched === 1 ? "" : "s"} por
                correo) · {result.companies_created} empresa{result.companies_created === 1 ? "" : "s"} nueva
                {result.companies_created === 1 ? "" : "s"}
                {result.companies_matched > 0 && ` · ${result.companies_matched} empresa(s) reutilizada(s)`}
                {result.skipped > 0 && ` · ${result.skipped} fila(s) omitida(s) sin nombre ni correo`}
              </p>
              {result.rows.some((r) => r.status === "error") && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--color-chart-2)]">
                  {result.rows
                    .filter((r) => r.status === "error")
                    .slice(0, 10)
                    .map((r) => (
                      <li key={r.row}>
                        Fila {r.row + 1}: {r.message}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}

          {importMutation.isError && (
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-chart-2)]">
              <AlertCircle className="size-3.5 shrink-0" />
              No se pudo importar — intenta de nuevo.
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={importable.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate(importable)}
              className="bee-btn bee-btn--primary text-xs"
            >
              {importMutation.isPending
                ? "Importando…"
                : `Importar ${importable.length} lead${importable.length === 1 ? "" : "s"}`}
            </button>
            {rows.length > 0 && (
              <button type="button" onClick={handleReset} className="bee-btn-ghost text-xs">
                Empezar de nuevo
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
