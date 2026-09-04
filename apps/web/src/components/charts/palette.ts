/**
 * BEE color system for data — every color here is a brand token, nothing
 * invented, and every mix goes toward white only (mixing a hue with ink
 * gives golds and purples that are not BEE's).
 *
 * Two rules decide every color in a chart:
 *
 *  1. **One hue per chart, chosen by what the chart is about** (`TONE`):
 *     honey for the market and signals, lilac for what BEE prepares,
 *     magenta for priority and urgency, indigo for forecast and team,
 *     lavender for the calm/neutral. Series and levels inside that chart
 *     are told apart by intensity — `tint(hue, 100 | 70 | 45)` — and
 *     anything past the third level is the page grey (`REST`).
 *
 *  2. **The honeycomb is the one exception**: BEE's identity, it walks the
 *     whole palette from the hot centre to the cool edge (`HIVE_RAMP`),
 *     thirteen steps, never interpolated.
 *
 * Text and icons never carry a color; the greens live on the Ventas page,
 * on the CRM's closed cards, and wherever a person picked one.
 */

/** Hues by the job they do. */
export const TONE = {
  /** Market and signals — what BEE detects. */
  market: "var(--color-chart-1)",
  /** The deeper honey: a 2px line, the hover dot, the hive's centre. */
  marketDeep: "var(--color-chart-2)",
  /** What BEE prepares — strategies, battlecards, funnel, sequences. */
  prepared: "var(--color-chart-6)",
  /** Priority and urgency — today's plays, a hot account. */
  urgency: "var(--color-chart-5)",
  /** Forecast, projection and the team. */
  forecast: "var(--color-chart-4)",
  /** The calm surface: active pill, hover row, the coolest hive ring. */
  calm: "var(--color-primary)",
} as const;

/** Kept for existing call sites; new code reads TONE. */
export const DATA = {
  indigo: TONE.forecast,
  honey: TONE.marketDeep,
  honeyFill: TONE.market,
  magenta: TONE.urgency,
  violet: TONE.prepared,
  lavender: TONE.calm,
  ink: "var(--color-text)",
  muted: "var(--color-text-muted)",
} as const;

/** Sales-only greens: closed revenue and won clients on the Ventas page. */
export const SALES = {
  won: "#52c871",
  lime: "#9cd147",
  mint: "#b4e8c5",
} as const;

/** Fixed categorical order — never cycled. */
export const SERIES = [DATA.indigo, DATA.honey, DATA.magenta, DATA.violet] as const;

/** The three intensities a hue takes inside one chart. */
export type Intensity = 100 | 70 | 45;
export const INTENSITIES: readonly Intensity[] = [100, 70, 45];

export function mix(color: string, pct: number, base = "var(--color-card)"): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${base})`;
}

/** A hue at one of its three intensities toward white. */
export function tint(color: string, level: Intensity): string {
  return level === 100 ? color : mix(color, level);
}

/** The i-th level of a hue: 100, 70, 45, then the page grey for the rest. */
export function level(color: string, index: number): string {
  return index < INTENSITIES.length ? tint(color, INTENSITIES[index]) : REST;
}

/** What is left over after the third level, and an empty cell. */
export const REST = "var(--color-background)";

/** The honeycomb's ramp, hot centre → cool edge, by steps, all BEE. */
export const HIVE_RAMP: readonly string[] = [
  "var(--color-chart-2)",
  "var(--color-chart-1)",
  "var(--color-chart-3)",
  "var(--color-chart-5)",
  mix("var(--color-chart-5)", 70),
  "var(--color-chart-6)",
  mix("var(--color-chart-6)", 70),
  "var(--color-chart-4)",
  mix("var(--color-chart-4)", 70),
  "var(--color-primary)",
  mix("var(--color-chart-4)", 45),
  mix("var(--color-primary)", 70),
  mix("var(--color-primary)", 45),
];

/** Sequential fill for a quantity 0–1 inside one hue: three steps + grey. */
export function heat(color: string, value: number): string {
  if (value <= 0) return REST;
  return value < 0.34 ? tint(color, 45) : value < 0.67 ? tint(color, 70) : color;
}

/** The nine tokens a person can pick (meeting, opportunity, teammate, view). */
export type PickableColor =
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "green-1"
  | "green-2"
  | "green-3";
export const PICKABLE_BEE: readonly PickableColor[] = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"];
export const PICKABLE_GREENS: readonly PickableColor[] = ["green-1", "green-2", "green-3"];

/** CSS value of a pickable token. */
export function pickedColor(token: PickableColor | null | undefined): string | null {
  return token ? `var(--color-${token})` : null;
}
