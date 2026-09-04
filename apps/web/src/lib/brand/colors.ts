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

/** One color per signal type, used everywhere a signal is drawn (SignalCard
 * fill, badges, chart series) so the same kind of signal always looks the
 * same across the app. Fills are the palette mixed toward the card white;
 * borders use the pure hue. Anything not listed falls back to blue. */
export type SignalTone = "amber" | "orange" | "gold" | "blue" | "magenta" | "violet";

export const SIGNAL_TYPE_TONE: Record<string, SignalTone> = {
  funding_round: "amber",
  funding_grant: "amber",
  hiring: "blue",
  leadership_change: "magenta",
  tech_adoption: "violet",
  product_launch: "orange",
  engagement: "gold",
  news_mention: "gold",
  expansion: "blue",
  franchise_expansion: "blue",
  merger_acquisition: "magenta",
  public_tender: "violet",
  regulatory_change: "orange",
  other: "blue",
};

export function signalTone(signalType: string | null | undefined): SignalTone {
  return (signalType && SIGNAL_TYPE_TONE[signalType]) || "blue";
}

/** CSS custom property (var(--color-chart-N)) for a tone. */
export const TONE_CSS_VAR: Record<SignalTone, string> = {
  amber: "var(--color-chart-1)",
  orange: "var(--color-chart-2)",
  gold: "var(--color-chart-3)",
  blue: "var(--color-chart-4)",
  magenta: "var(--color-chart-5)",
  violet: "var(--color-chart-6)",
};

/** Card fill for a signal of this type — the hue washed toward white. */
/** Card fill for a signal: its type's BEE color at the same three strengths
 *  the CRM cards use by score (100 % hot · 70 % · 45 %) — never a pale wash
 *  that reads as a different yellow or pink than the brand's. */
export function signalFill(signalType: string | null | undefined, score?: number | null): string {
  const pct = score == null ? 70 : score >= 75 ? 100 : score >= 50 ? 70 : 45;
  const tone = TONE_CSS_VAR[signalTone(signalType)];
  return pct === 100 ? tone : `color-mix(in srgb, ${tone} ${pct}%, var(--color-card))`;
}
