/**
 * Parser de CSV mínimo, sin dependencias — soporta comillas dobles (con
 * comas o comillas escapadas `""` adentro) y CRLF/LF. Suficiente para
 * archivos exportados de Excel/Google Sheets/CRMs comunes; no intenta
 * cubrir el estándar RFC 4180 completo.
 */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Parsea un CSV con encabezado en la primera fila → un objeto por fila. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r\n|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] ?? "").trim();
    });
    return row;
  });
}

/** Escapa un valor para CSV: lo entrecomilla si contiene coma, comilla o salto de línea. */
function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Arma un CSV (con encabezado) a partir de filas y columnas — el inverso de parseCsv. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const bodyLines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(","));
  return [headerLine, ...bodyLines].join("\r\n");
}

/** Dispara la descarga de un CSV en el navegador — sin backend, todo en el cliente. */
export function downloadCsv(filename: string, csvContent: string): void {
  // BOM UTF-8 para que Excel reconozca acentos/ñ correctamente al abrir el archivo.
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
