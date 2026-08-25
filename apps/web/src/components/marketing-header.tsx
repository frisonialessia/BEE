import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Cabecera pública — Iniciar sesión + Funcionalidades. */
export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-6">
        <Link href="/" aria-label="Inicio BEE" className="shrink-0">
          <Logo />
        </Link>
        {/* Funcionalidades/Iniciar sesión ocultos bajo sm: en un viewport de
         * teléfono no entran junto al logo y al CTA principal sin que este
         * último se salga de la pantalla — el CTA es lo único imprescindible
         * ahí; los otros dos siguen alcanzables desde el footer. */}
        <nav className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="#modulos">Funcionalidades</a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild size="sm" className="bee-btn--primary">
            <Link href="/register">Comenzar ahora</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
