/**
 * BEE panel & status class helpers — palette-only, no Tailwind grays/blues/greens.
 */

/** Outer dashboard card shell */
export const BEE_PANEL = "bee-panel";

/** Inner inset block (inputs, stat pods) */
export const BEE_INSET = "bee-inset";

/** Primary action button */
export const BEE_BTN = "bee-btn";

/** Secondary/outline button */
export const BEE_BTN_GHOST = "bee-btn-ghost";

/** Form controls */
export const BEE_INPUT = "bee-input";

/** Stat pod in a grid */
export const BEE_STAT = "bee-stat";

/** Muted label text */
export const BEE_MUTED = "text-[var(--color-text-muted)]";

/** Status badges — chart palette only */
export const BEE_STATUS = {
  c1: "bee-status bee-status--1",
  c2: "bee-status bee-status--2",
  c3: "bee-status bee-status--3",
  c4: "bee-status bee-status--4",
  c5: "bee-status bee-status--5",
  c6: "bee-status bee-status--6",
} as const;

/** Scenario / bar fills */
export const BEE_BAR = {
  c1: "bee-bar bee-bar--1",
  c2: "bee-bar bee-bar--2",
  c3: "bee-bar bee-bar--3",
  c4: "bee-bar bee-bar--4",
  c5: "bee-bar bee-bar--5",
  c6: "bee-bar bee-bar--6",
} as const;

/** Icon accent colors */
export const BEE_ICON = {
  c1: "text-[var(--color-chart-1)]",
  c2: "text-[var(--color-chart-2)]",
  c3: "text-[var(--color-chart-3)]",
  c4: "text-[var(--color-chart-4)]",
  c5: "text-[var(--color-chart-5)]",
  c6: "text-[var(--color-chart-6)]",
} as const;
