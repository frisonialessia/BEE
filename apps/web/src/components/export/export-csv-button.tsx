"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { downloadCsv, toCsv } from "@/lib/csv";

/** Botón genérico de "Exportar CSV" — sirve para cualquier lista de la app,
 *  solo cambian las filas y las columnas que recibe. */
export function ExportCsvButton<T extends Record<string, unknown>>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: { key: keyof T; header: string }[];
  filename: string;
}) {
  const t = useTranslations("sharedB.exportCsv");

  function handleClick() {
    const csv = toCsv(rows, columns);
    downloadCsv(filename, csv);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={rows.length === 0}
      className="bee-btn-ghost inline-flex items-center gap-1.5"
    >
      <Download className="size-3.5" />
      {t("button")}
    </button>
  );
}
