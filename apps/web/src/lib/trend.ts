/**
 * Agrupa fechas ISO en cubos diarios para las últimas N días (incluye hoy).
 * Se usa para las mini-tendencias (sparklines) del Resumen — calculado a
 * partir de los datos ya obtenidos (no inventa números que el backend no
 * devuelve).
 */
export function bucketByDay(isoDates: string[], days = 7): number[] {
  const buckets = new Array(days).fill(0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const iso of isoDates) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    const diffDays = Math.floor((todayStart - new Date(t).setHours(0, 0, 0, 0)) / dayMs);
    const index = days - 1 - diffDays;
    if (index >= 0 && index < days) buckets[index] += 1;
  }

  return buckets;
}

/**
 * Igual que {@link bucketByDay} pero para un promedio en vez de un conteo
 * (p. ej. score medio por día, no cuántas señales llegaron). Un día sin
 * datos vuelve `null`, nunca 0 — un score en 0 se leería como "se
 * desplomó", no como "no hubo señales ese día". El caller filtra los
 * `null` antes de pasarlo a Sparkline, que ya de por sí no dibuja nada
 * con menos de 2 puntos reales.
 */
export function bucketAverageByDay(
  entries: { date: string; value: number }[],
  days = 7,
): (number | null)[] {
  const sums = new Array(days).fill(0);
  const counts = new Array(days).fill(0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const { date, value } of entries) {
    const t = new Date(date).getTime();
    if (Number.isNaN(t)) continue;
    const diffDays = Math.floor((todayStart - new Date(t).setHours(0, 0, 0, 0)) / dayMs);
    const index = days - 1 - diffDays;
    if (index >= 0 && index < days) {
      sums[index] += value;
      counts[index] += 1;
    }
  }

  return sums.map((sum: number, i: number) => (counts[i] > 0 ? sum / counts[i] : null));
}
