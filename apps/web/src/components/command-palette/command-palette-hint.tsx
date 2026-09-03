"use client";

import { useTranslations } from "next-intl";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";

/** Botón/pista para abrir el Command Palette — el atajo real es Cmd/Ctrl+K
 *  desde cualquier pantalla; esto es solo para que se note que existe.
 *  Oculto en celular: sin teclado físico, el atajo no aplica. */
export function CommandPaletteHint() {
  const t = useTranslations("common.commandPalette");
  const { setOpen } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="hidden shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 py-1 bee-micro transition-colors hover:bg-[var(--color-primary)] hover:text-foreground sm:flex"
      aria-label={t("openAria")}
      title={t("hintTitle")}
    >
      <kbd className="font-sans">⌘</kbd>
      <kbd className="font-sans">K</kbd>
    </button>
  );
}
