/**
 * BEE brand palette — single source for charts and programmatic color use.
 * CSS tokens live in globals.css (--bee-*).
 */
export const BEE_COLORS = {
  background: "#f7f7f7",
  text: "#222222",
  surfacePrimary: "#c8d7f8",
  surfaceSecondary: "#dbdeff",
  chart: {
    amber: "#ffb213",
    orange: "#fca000",
    gold: "#ffbe55",
    blue: "#8a9eff",
    magenta: "#d567ff",
    violet: "#c197ff",
  },
} as const;

/** Closing-temperature scale for Colmena hex map (cool → hot). */
export const TEMPERATURE_SCALE = [
  BEE_COLORS.surfaceSecondary,
  BEE_COLORS.chart.blue,
  BEE_COLORS.chart.gold,
  BEE_COLORS.chart.amber,
  BEE_COLORS.chart.orange,
  BEE_COLORS.chart.magenta,
] as const;
