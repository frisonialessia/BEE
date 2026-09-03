"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { useMobileNav } from "@/components/dashboard/mobile-nav-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NAV_GROUPS, type NavGroup } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "bee-rail-collapsed";

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
 *  superpuesto — ver useMobileNav y .bee-rail en globals.css.
 *
 *  Contraíble a solo-íconos (botón al pie, persistido en localStorage) —
 *  el ancho fijo le quitaba espacio real al contenido, que es lo que
 *  termina viéndose condensado. Solo aplica en escritorio: el panel
 *  superpuesto de mobile siempre se abre a ancho completo (ver el
 *  media query de .bee-rail--collapsed en globals.css), donde no hay
 *  contenido de al lado compitiendo por espacio. */
export function DashboardRail({
  groups = NAV_GROUPS,
  homeHref = "/dashboard",
}: {
  groups?: NavGroup[];
  homeHref?: string;
}) {
  const pathname = usePathname();
  const { open, close } = useMobileNav();
  const t = useTranslations("nav");
  // Starts expanded on every render up to and including hydration (/probar
  // renders this rail directly, with no client-only auth gate in front of
  // it like the real dashboard has — so unlike OnboardingProvider, this
  // one really can be part of the server-rendered HTML) and only then
  // syncs from localStorage — a one-time mount read, not a state->effect
  // loop, so no cascading-render risk despite the lint rule's default
  // assumption.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private browsing / storage blocked — stays expanded, no crash.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Same as above — losing the preference is fine, breaking isn't.
      }
      return next;
    });
  }

  return (
    <>
      {open && (
        <button
          type="button"
          className="bee-rail-overlay"
          aria-label={t("closeMenu")}
          onClick={close}
        />
      )}
      <aside
        className={cn("bee-rail", open && "bee-rail--open", collapsed && "bee-rail--collapsed")}
        aria-label={t("mainNavigation")}
      >
        <Link href={homeHref} className="mb-4 px-2" aria-label="Inicio BEE" onClick={close}>
          <Logo withText={!collapsed} />
        </Link>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
          {groups.map((group, gi) => (
            <div key={group.groupKey ?? `group-${gi}`} className={gi > 0 ? "mt-3" : undefined}>
              {group.groupKey && !collapsed && (
                <p className="mb-1 px-3 bee-eyebrow">
                  {t(`groups.${group.groupKey}`)}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map(({ href, icon: Icon, labelKey, ...rest }) => {
                  const exact = "exact" in rest && rest.exact;
                  const active = exact ? pathname === href : pathname.startsWith(href);
                  const label = t(`items.${labelKey}`);

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={close}
                      // Tour target — the guided tour (features/tour) highlights
                      // nav items by their own href, since this rail is the one
                      // piece of chrome mounted (and identical) on every route.
                      data-tour={href}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "bee-rail-link",
                        active && "bee-rail-link--active",
                        collapsed && "bee-rail-link--collapsed",
                      )}
                    >
                      <Icon className="size-4 shrink-0 stroke-[1.5]" />
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* sm:hidden — the complement of DashboardHeader's own
         * `hidden sm:inline-flex` LanguageSwitcher: below `sm` the header
         * has no room for it (MobileNavToggle + GlobalSearch already
         * compete for that space), but this off-canvas panel opens to
         * full width there and has room to spare. Exactly one of the two
         * copies is ever visible at a given width, never both. */}
        <LanguageSwitcher variant="subtle" className="mb-2 self-start sm:hidden" />

        <button
          type="button"
          onClick={toggleCollapsed}
          className="bee-rail-collapse-toggle"
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          {!collapsed && <span>{t("collapseSidebar")}</span>}
        </button>
      </aside>
    </>
  );
}
