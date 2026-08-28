"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import { useMobileNav } from "@/components/dashboard/mobile-nav-context";
import { NAV_GROUPS, type NavGroup } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

/** El Resumen va primero — es lo más importante, la vista que responde
 *  "¿cómo va todo?" de un vistazo. Cuenta, notificaciones y el asistente
 *  viven en el encabezado (DashboardHeader), no aquí — este rail es solo
 *  navegación.
 *
 *  Agrupado por lo que cada sección realmente es (CRM / Inteligencia /
 *  Operaciones), para que no haya que adivinar dónde vive cada cosa.
 *  La lista misma vive en lib/nav-items.ts — el Command Palette (Cmd+K)
 *  la comparte, para que nunca queden desincronizados.
 *
 *  `groups`/`homeHref` son opcionales — por defecto es el rail del
 *  Dashboard real, pero /probar reusa este mismo componente con
 *  `PROBAR_NAV_GROUPS` (ver app/probar/nav-items.ts) para tener la misma
 *  navegación responsive (rail fijo en escritorio, panel superpuesto en
 *  mobile) sin duplicar el componente. */

/** Sidebar lateral con nombre de página visible en cada ítem de navegación.
 *  En pantallas chicas (<768px) vive fuera de cuadro y entra como panel
 *  superpuesto — ver useMobileNav y .bee-rail en globals.css. */
export function DashboardRail({
  groups = NAV_GROUPS,
  homeHref = "/dashboard",
}: {
  groups?: NavGroup[];
  homeHref?: string;
}) {
  const pathname = usePathname();
  const { open, close } = useMobileNav();

  return (
    <>
      {open && (
        <button
          type="button"
          className="bee-rail-overlay"
          aria-label="Cerrar menú de navegación"
          onClick={close}
        />
      )}
      <aside className={cn("bee-rail", open && "bee-rail--open")} aria-label="Navegación principal">
        <Link href={homeHref} className="mb-4 px-1.5" aria-label="Inicio BEE" onClick={close}>
          <Logo />
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
          {groups.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`} className={gi > 0 ? "mt-3" : undefined}>
              {group.label && (
                <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ href, icon: Icon, label, ...rest }) => {
                  const exact = "exact" in rest && rest.exact;
                  const active = exact ? pathname === href : pathname.startsWith(href);

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={close}
                      className={cn("bee-rail-link", active && "bee-rail-link--active")}
                    >
                      <Icon className="size-4 shrink-0 stroke-[1.5]" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
