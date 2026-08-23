"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface MobileNavContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

/** Estado del sidebar en pantallas chicas — el rail vive fuera de cuadro
 *  (ver .bee-rail en globals.css) y este contexto es lo único que conecta
 *  el botón de menú del encabezado con el propio rail. En escritorio nunca
 *  se abre (no hay botón que lo dispare), así que no cambia nada ahí. */
export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Los links del rail ya cierran el menú en su onClick, pero eso no cubre
  // la navegación que no pasa por un click (atrás/adelante del navegador,
  // router.push desde otro lado): cerrar también cuando cambia la ruta.
  // Ajustar durante el render (patrón oficial de React para "derivar estado
  // de un valor que cambió") en vez de un efecto — un efecto haría un
  // render de más y dispara la regla set-state-in-effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ open, toggle, close }), [open, toggle, close]);

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error("useMobileNav must be used within MobileNavProvider");
  }
  return ctx;
}
