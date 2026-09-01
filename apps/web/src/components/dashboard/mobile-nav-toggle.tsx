"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMobileNav } from "@/components/dashboard/mobile-nav-context";

/** Botón de menú — solo visible en pantallas chicas, abre el sidebar como
 *  panel superpuesto (ver .bee-rail--open en globals.css). */
export function MobileNavToggle() {
  const t = useTranslations("nav");
  const { toggle } = useMobileNav();

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--color-primary)] hover:text-foreground md:hidden"
      aria-label={t("openMenu")}
    >
      <Menu className="size-4 stroke-[1.5]" />
    </button>
  );
}
