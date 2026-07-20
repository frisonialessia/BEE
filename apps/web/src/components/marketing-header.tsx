import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Cabecera pública — Iniciar sesión + Funcionalidades. */
export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Inicio BEE">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="#features">Funcionalidades</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Iniciar sesión</Link>
          </Button>
          <Button asChild size="sm" className="bee-btn--dark">
            <Link href="/dashboard">Abrir el hive</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
