/**
 * BEE brand palette — Editorial Bento Grid (Salesforce Enterprise Modern).
 */
export const BEE_COLORS = {
  background: "#f7f7f7",
  text: "#222222",
  card: "#dbdeff",
  primary: "#c8d7f8",
  accentWarm: "#ffbe55",
  accentGold: "#ffb213",
  chart: {
    amber: "#ffb213",
    orange: "#fca000",
    gold: "#ffbe55",
    blue: "#8a9eff",
    magenta: "#d567ff",
    violet: "#c197ff",
  },
} as const;

export const CHART_PALETTE = [
  BEE_COLORS.chart.amber,
  BEE_COLORS.chart.orange,
  BEE_COLORS.chart.gold,
  BEE_COLORS.chart.blue,
  BEE_COLORS.chart.magenta,
  BEE_COLORS.chart.violet,
] as const;

/** Bento block tone rotation */
export const BENTO_TONES = [
  BEE_COLORS.card,
  BEE_COLORS.primary,
  "#ede4f7",
  BEE_COLORS.accentWarm,
] as const;
