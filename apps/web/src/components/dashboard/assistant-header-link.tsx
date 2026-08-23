"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Acceso al Asistente desde el encabezado — la conversación completa
 *  vive en /dashboard/assistant; el cuadro flotante (AskBeeFab) sigue
 *  disponible para preguntas rápidas sin salir de la pantalla actual. */
export function AssistantHeaderLink() {
  const pathname = usePathname();
  const active = pathname?.startsWith("/dashboard/assistant");

  return (
    <Link
      href="/dashboard/assistant"
      aria-label="Asistente"
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--color-primary)] hover:text-foreground",
        active && "bg-[var(--color-primary)] text-foreground",
      )}
    >
      <Sparkles className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Asistente</span>
    </Link>
  );
}
