import { cn } from "@/lib/utils";

/**
 * BEE wordmark + isotipo (mascota). Usa /icon.svg — el mismo archivo que
 * app/icon.svg sirve como favicon — así el glyph del logo y el del ícono
 * de la pestaña del navegador son exactamente el mismo asset, una sola
 * fuente de verdad en vez de dos copias que puedan desalinearse.
 */
export function Logo({
  className,
  withText = true,
}: {
  className?: string;
  withText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, no una foto que se beneficie de next/image */}
      <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" aria-hidden="true" />
      {withText && (
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight">
          BEE
          <span className="text-muted-foreground font-normal"> Intelligence</span>
        </span>
      )}
    </div>
  );
}
