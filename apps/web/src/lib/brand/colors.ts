/**
 * BEE brand palette — single source for charts and programmatic color use.
 * CSS tokens live in globals.css (--color-* / --bee-*).
 */
export const BEE_COLORS = {
  background: "#f7f7f7",
  text: "#222222",
  // NOT the real card surface color — that's --color-card in globals.css
  // (#ffffff, plain white). This is one of four decorative pastel tints
  // BENTO_TONES below rotates through; named `card` only because it's one
  // of the tones a bee-bento tile can take, which used to read as if it had
  // drifted from the real --color-card token instead of being intentionally
  // different from it.
  cardTint: "#dbdeff",
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
  BEE_COLORS.cardTint,
  BEE_COLORS.primary,
  "#ede4f7",
  BEE_COLORS.chart.gold,
] as const;
