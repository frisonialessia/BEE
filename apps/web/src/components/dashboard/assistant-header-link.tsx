"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDashboardBase } from "@/lib/demo/mode";
import { cn } from "@/lib/utils";

/** Acceso al Asistente desde el encabezado — la conversación completa
 *  vive en /dashboard/assistant (o /probar/assistant en el sandbox, mismo
 *  componente); el cuadro flotante (AskBeeFab) sigue disponible para
 *  preguntas rápidas sin salir de la pantalla actual. */
export function AssistantHeaderLink() {
  const t = useTranslations("workspace.assistant");
  const pathname = usePathname();
  const base = useDashboardBase();
  const active = pathname?.startsWith(`${base}/assistant`);

  return (
    <Link
      href={`${base}/assistant`}
      aria-label={t("navLabel")}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--color-primary)] hover:text-foreground",
        active && "bg-[var(--color-primary)] text-foreground",
      )}
    >
      <Sparkles className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">{t("navLabel")}</span>
    </Link>
  );
}
