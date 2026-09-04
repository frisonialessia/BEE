import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one page header in BEE: eyebrow · title · one-line caption on the
 * left, tabs and actions on the right, all in a single row, so the KPI
 * strip under it starts at the same height on every page. On phones the
 * row stacks: title first, then the tabs (scrolling sideways if they must),
 * then the actions full width.
 */
export function PageHeader({
  eyebrow,
  title,
  caption,
  tabs,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  caption?: string;
  /** The tab strip (MergedPageTabs renders it here). */
  tabs?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("bee-page-head", className)}>
      <div className="min-w-0">
        <p className="bee-eyebrow">{eyebrow}</p>
        <h1 className="bee-display mt-1 truncate">{title}</h1>
        {caption && <p className="bee-caption mt-1 line-clamp-2">{caption}</p>}
      </div>
      {(tabs || actions) && (
        <div className="bee-page-head__side">
          {tabs}
          {actions && <div className="bee-page-head__actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}

/**
 * Header → KPI strip → content, with the standard rhythm between them.
 * Every page renders through this so margins never drift.
 */
export function PageShell({
  header,
  kpis,
  children,
  className,
}: {
  header: ReactNode;
  kpis?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bee-page", className)}>
      {header}
      {kpis && <div className="bee-page__kpis">{kpis}</div>}
      <div className="bee-page__body">{children}</div>
    </div>
  );
}
