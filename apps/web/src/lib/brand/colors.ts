/**
 * BEE brand palette — single source for charts and programmatic color use.
 * CSS tokens live in globals.css (--color-* / --bee-*).
 */
export const BEE_COLORS = {
  background: "#f7f7f7",
  text: "#222222",
  card: "#dbdeff",
  primary: "#c8d7f8",
  chart: {
    amber: "#ffb213",
    orange: "#fca000",
    gold: "#ffbe55",
    blue: "#8a9eff",
    magenta: "#d567ff",
    violet: "#c197ff",
  },
} as const;

/** Closed chart palette for Colmena hex map and all data visualization. */
export const CHART_PALETTE = [
  BEE_COLORS.chart.amber,
  BEE_COLORS.chart.orange,
  BEE_COLORS.chart.gold,
  BEE_COLORS.chart.blue,
  BEE_COLORS.chart.magenta,
  BEE_COLORS.chart.violet,
] as const;

/** Closing-temperature scale — maps cool → hot across the closed palette. */
export const TEMPERATURE_SCALE = [...CHART_PALETTE] as const;

/** Rotación de tonos para bloques Bento. */
export const BENTO_TONES = [
  BEE_COLORS.card,
  BEE_COLORS.primary,
  "#ede4f7",
  BEE_COLORS.chart.gold,
] as const;
