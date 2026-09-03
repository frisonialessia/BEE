"use client";

import { Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChatMessage } from "@/components/assistant/chat-message";
import { useAssistantChat } from "@/features/assistant/use-assistant-chat";

/**
 * Cuadro flotante rápido — disponible en cualquier pantalla del dashboard
 * para preguntas cortas sin salir de lo que estás viendo. Usa el mismo
 * hilo/motor que la página completa del Asistente (useAssistantChat), así
 * que preguntar aquí o allá responde igual.
 */
export function AskBeeFab() {
  const t = useTranslations("workspace.assistant");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, send, pending } = useAssistantChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // La página completa ya es el chat — no hace falta el flotante ahí encima.
  if (pathname?.startsWith("/dashboard/assistant") || pathname?.startsWith("/probar/assistant")) return null;
  const assistantHref = pathname?.startsWith("/probar") ? "/probar/assistant" : "/dashboard/assistant";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || pending) return;
    send(input);
    setInput("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="bee-fab-panel mb-3 flex h-[420px] w-[min(340px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-[var(--color-background)] shadow-[0_8px_32px_color-mix(in_srgb,var(--color-text)_16%,transparent)]">
          <div className="bee-assistant-gradient flex shrink-0 items-center gap-2.5 px-4 py-3">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white/20 shadow-[0_0_0_5px_rgba(255,255,255,0.12)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, no una foto */}
              <img src="/assistant-bee.svg" alt="" className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 text-white">
              <p className="text-sm font-semibold leading-tight">{t("fab.title")}</p>
              <p className="text-[11px] leading-tight text-white/85">{t("fab.subtitle")}</p>
            </div>
            {/* X explícita del lado derecho del panel — antes cerrar dependía
             * únicamente del botón flotante de abajo cambiando de ícono, que
             * vive fuera del panel mismo. */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("fab.toggleCloseAria")}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">{t("fab.emptyHint")}</p>
            ) : (
              messages.map((m) => <ChatMessage key={m.id} message={m} />)
            )}
            {pending && <p className="text-xs text-muted-foreground">{t("thinking")}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-border p-2.5">
            <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("fab.quickPlaceholder")}
                className="flex-1 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!input.trim() || pending}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-white disabled:opacity-40"
                aria-label={t("fab.sendAria")}
              >
                <Send className="size-3" />
              </button>
            </form>
            <Link
              href={assistantHref}
              className="mt-1.5 block text-center bee-micro hover:text-[var(--color-cta)]"
            >
              {t("fab.openFull")}
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bee-assistant-fab flex size-12 items-center justify-center rounded-full transition-transform hover:scale-105"
        aria-label={open ? t("fab.toggleCloseAria") : t("fab.toggleOpenAria")}
      >
        {/* Siempre la mascota, abierto o cerrado — cerrar ahora tiene su
         * propia X explícita en el header del panel (lado derecho), así
         * que este botón no necesita cambiar de ícono para comunicarlo. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, sin fondo propio (a diferencia de icon.svg, que trae su hexágono claro). Ícono chico (20px sobre un botón de 48px) a propósito: a todo color se pierde si ocupa el botón entero — con aire alrededor se lee limpio. */}
        <img src="/assistant-bee.svg" alt="" className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
