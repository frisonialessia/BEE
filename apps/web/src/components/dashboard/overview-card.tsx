import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one card shell every box on Resumen uses — same padding, same border,
 * same header (title + one-line caption on the left, an optional action on
 * the right), and `h-full` so the grid stretches every box in a row to the
 * same height. Tone is a border color only; the body is always white.
 */
export function OverviewCard({
  title,
  caption,
  action,
  span = 12,
  tone,
  className,
  children,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  /** Columns of the 12-column .bee-overview grid this box takes on desktop. */
  span?: 3 | 4 | 5 | 6 | 8 | 12;
  tone?: "blue" | "warm" | "violet" | "magenta";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("bee-card", tone && `bee-outline--${tone}`, className)}
      style={{ gridColumn: `span ${span}` }}
    >
      <div className="bee-card__head">
        <div className="min-w-0">
          <h2 className="bee-card-title !mb-0 truncate">{title}</h2>
          {caption && <p className="bee-caption truncate">{caption}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="bee-card__body">{children}</div>
    </section>
  );
}
