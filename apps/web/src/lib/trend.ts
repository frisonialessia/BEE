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
