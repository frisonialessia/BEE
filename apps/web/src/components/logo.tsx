import { cn } from "@/lib/utils";

/**
 * BEE wordmark + mascot glyph (mismo ícono que app/icon.svg — el favicon).
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
      <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center">
        <svg viewBox="0 0 200 200" className="h-8 w-8" aria-hidden="true">
          <path
            d="M72 14 L128 14 L186 62 L186 138 L128 186 L72 186 L14 138 L14 62 Z"
            fill="#EDEDED"
          />
          <path d="M115 50 C 112 38, 106 30, 98 25" fill="none" stroke="#FFB213" strokeWidth="5" strokeLinecap="round" />
          <circle cx="96" cy="22" r="6.5" fill="#FFB213" />
          <path d="M126 58 C 130 46, 138 38, 148 33" fill="none" stroke="#FFB213" strokeWidth="5" strokeLinecap="round" />
          <circle cx="151" cy="30" r="6.5" fill="#FFB213" />
          <path d="M112 172 L 128 176 L 118 186 Z" fill="#22201C" />
          <path
            d="M96 30
               C 62 26, 34 54, 34 92
               C 34 122, 44 148, 62 162
               C 80 176, 108 180, 128 168
               C 144 158, 152 138, 148 116
               C 146 100, 140 82, 122 62
               C 114 52, 104 40, 96 30 Z"
            fill="#FFB213"
          />
          <path
            d="M35 114 C 66 130, 116 133, 149 121 L 147 137 C 112 149, 64 146, 36 130 Z"
            fill="#FFCB66"
          />
          <path
            d="M34 106 C 66 122, 118 126, 150 113 L 150 121 C 117 134, 65 130, 35 114 Z"
            fill="#22201C"
          />
          <path
            d="M39 138 C 71 152, 112 155, 141 144 L 137 158 C 106 169, 66 166, 40 152 Z"
            fill="#22201C"
          />
          <circle cx="70" cy="98" r="7" fill="#22201C" />
          <circle cx="98" cy="98" r="7" fill="#22201C" />
          <path d="M76 112 C 81 118, 89 118, 94 112" fill="none" stroke="#22201C" strokeWidth="5" strokeLinecap="round" />
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
