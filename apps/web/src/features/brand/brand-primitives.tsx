import type { ReactNode } from "react";

import { REST, mix } from "@/components/charts/palette";
import { cn } from "@/lib/utils";

/**
 * The three small marks every box on Voz de marca is built from. Each one
 * takes the box's single hue and wears it at a strength — a chip at 20 %, a
 * meter at 100 % on a 12 % track — so a box never mixes two colors and a
 * tag here looks like a StatTile label anywhere else in BEE.
 */

/** Tinted pill with a dot — StatTile's label-chip recipe; strength 0 sits on
 *  the page grey. `muted` is for things the voice must NOT do (forbidden
 *  phrases): struck through, dot faded. */
export function Chip({
  tone,
  strength = 20,
  dot = true,
  muted = false,
  className,
  children,
}: {
  tone: string;
  strength?: number;
  dot?: boolean;
  muted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        muted ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text)]",
        className,
      )}
      style={{ background: strength <= 0 ? REST : mix(tone, strength) }}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full" style={{ background: tone, opacity: muted ? 0.45 : 1 }} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Thin horizontal meter, 0–1, hue on a faint track of the same hue. */
export function Meter({ value, tone, className }: { value: number; tone: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full", className)} style={{ background: REST }} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: tone }} />
    </div>
  );
}

/** A labelled slot: the term in small caps, the value, and the one-line
 *  plain-language hint that says what the term means. */
export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="bee-micro font-medium uppercase tracking-wide">{label}</p>
      {children}
      {hint && <p className="bee-micro mt-0.5">{hint}</p>}
    </div>
  );
}

/** Form label at the page's micro size — always bound to its control by id. */
export function FormLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="bee-micro mb-1 block font-medium">
      {children}
    </label>
  );
}
