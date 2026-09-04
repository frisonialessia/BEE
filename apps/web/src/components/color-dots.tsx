"use client";

import { useTranslations } from "next-intl";

import { PICKABLE_BEE, PICKABLE_GREENS, type PickableColor } from "@/components/charts/palette";

/**
 * The calendar dialog's color row, shared: the six BEE hues, a hairline,
 * the three greens, a ring in ink on the chosen one. Used wherever a person
 * picks a color — an opportunity, a teammate, a saved view. `none` adds the
 * dashed "no color" dot at the start.
 */
export function ColorDots({
  value,
  onChange,
  none = true,
  size = 24,
}: {
  value: PickableColor | null;
  onChange: (next: PickableColor | null) => void;
  none?: boolean;
  size?: number;
}) {
  const t = useTranslations("shared.colorDots");
  const dot = (c: PickableColor) => (
    <button
      key={c}
      type="button"
      aria-label={t(`names.${c}`)}
      title={t(`names.${c}`)}
      aria-pressed={value === c}
      onClick={() => onChange(c)}
      className="bee-dot shrink-0"
      style={{ width: size, height: size, background: `var(--color-${c})` }}
    />
  );
  return (
    <div role="group" aria-label={t("aria")} className="flex flex-wrap items-center gap-2">
      {none && (
        <button
          type="button"
          aria-label={t("none")}
          title={t("none")}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className="bee-dot grid shrink-0 place-items-center"
          style={{ width: size, height: size }}
        >
          <span className="block rounded-full border border-dashed border-[var(--color-text-muted)]" style={{ width: size - 8, height: size - 8 }} />
        </button>
      )}
      {PICKABLE_BEE.map(dot)}
      <span className="mx-0.5 h-5 w-px bg-[color-mix(in_srgb,var(--color-text)_14%,transparent)]" aria-hidden="true" />
      {PICKABLE_GREENS.map(dot)}
    </div>
  );
}
