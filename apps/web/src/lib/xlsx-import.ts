import { findDuplicateHeaders } from "@/lib/csv";

/** Parseo de .xlsx/.xls en el navegador — carga `xlsx` (SheetJS) de forma
 *  dinámica (`import()`) para que el paquete no infle el bundle principal;
 *  solo se descarga cuando alguien realmente abre el panel de importación.
 *  Devuelve el mismo shape que `parseCsv` (un objeto por fila, claves en
 *  minúscula) para que el resto del flujo de importación no tenga que saber
 *  qué formato subió el usuario. */
export async function parseXlsxFile(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];

  // header: 1 -> array-of-arrays (first row is the header, not auto-keyed) so
  // we can lower-case/trim headers the same way parseCsv does, keeping both
  // import paths behaving identically downstream.
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  if (raw.length === 0) return [];

  const headers = raw[0].map((h) => String(h ?? "").trim().toLowerCase());
  const duplicates = findDuplicateHeaders(headers);
  if (duplicates.length > 0) {
    throw new Error(
      `El archivo tiene columnas repetidas (${duplicates.join(", ")}) — cada fila perdería datos silenciosamente. Renombra o elimina la columna duplicada y vuelve a intentar.`,
    );
  }
  return raw.slice(1).map((line) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      const cell = line[i];
      row[header] = cell === undefined || cell === null ? "" : String(cell).trim();
    });
    return row;
  });
}
