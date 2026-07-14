import { cn } from "@/lib/utils";

/**
 * BEE wordmark + hexagon "hive" glyph.
 * A small, self-contained SVG so branding renders without external assets.
 */
export function Logo({
  className,
  withText = true,
}: {
  className?: string;
  withText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative inline-flex h-8 w-8 items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
          <path
            d="M12 2 20.66 7v10L12 22 3.34 17V7z"
            className="fill-primary/15 stroke-primary"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="12" r="3.2" className="fill-primary" />
        </svg>
      </span>
      {withText && (
        <span className="text-lg font-semibold tracking-tight">
          BEE
          <span className="text-muted-foreground font-normal"> Intelligence</span>
        </span>
      )}
    </div>
  );
}
