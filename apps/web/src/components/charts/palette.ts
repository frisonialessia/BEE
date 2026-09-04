/**
 * Data palette — colors by the job they do, validated for color-vision
 * deficiency and contrast (see the dataviz check run before adoption).
 *
 *  - Every color here is a BEE brand token, nothing invented: marks (lines,
 *    bars, dots) use the brand's deeper honey (--color-chart-2, #FCA000) so
 *    a 2px line still reads on white; the lighter honey (--color-chart-1,
 *    #FFB213) stays for fills, tiles and chips.
 *  - The green family is reserved for the Ventas page (closed revenue since
 *    the organization exists). Nowhere else: on every other page "up" is
 *    indigo and "down" is honey.
 */
export const DATA = {
  indigo: "var(--color-chart-4)",
  honey: "var(--color-chart-2)",
  honeyFill: "var(--color-chart-1)",
  magenta: "var(--color-chart-5)",
  violet: "var(--color-chart-6)",
  lavender: "var(--color-primary)",
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

export function mix(color: string, pct: number, base = "var(--color-card)"): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${base})`;
}
