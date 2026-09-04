import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one card shell every box in BEE uses — same padding, same hairline
 * border, same 24px radius and soft shadow, same header (title + one-line
 * caption on the left, an optional action on the right), and `h-full` so
 * the grid stretches every box in a row to the same height. The body is
 * always white; color lives only in the marks inside.
 */
export function OverviewCard({
  title,
  caption,
  action,
  span = 12,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  /** Columns of the 12-column .bee-overview grid this box takes on desktop. */
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("bee-card", className)} style={{ gridColumn: `span ${span}` }}>
      <div className="bee-card__head">
        <div className="min-w-0">
          <h2 className="bee-card-title !mb-0 truncate">{title}</h2>
          {caption && <p className="bee-caption truncate">{caption}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("bee-card__body", bodyClassName)}>{children}</div>
    </section>
  );
}

/** The quiet text link that sits in a card's corner ("Ver Señales ›"). */
export function CardLink({ href, children, onClick }: { href?: string; children: ReactNode; onClick?: () => void }) {
  const cls = "bee-caption whitespace-nowrap font-medium text-[var(--color-text)] hover:underline";
  if (href) {
    return (
      <a href={href} className={cls}>
        {children} ›
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children} ›
    </button>
  );
}
