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
