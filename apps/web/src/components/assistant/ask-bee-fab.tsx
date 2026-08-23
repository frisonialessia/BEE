"use client";

import { MessageCircle, Send, Sparkles, X } from "lucide-react";
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, send, pending } = useAssistantChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // La página completa ya es el chat — no hace falta el flotante ahí encima.
  if (pathname?.startsWith("/dashboard/assistant")) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || pending) return;
    send(input);
    setInput("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 flex h-[420px] w-[min(340px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-[var(--color-background)] shadow-[0_8px_32px_rgba(34,34,34,0.16)]">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-cta)] text-white">
                <Sparkles className="size-3" />
              </span>
              <p className="text-sm font-semibold">Asistente BEE</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-[var(--color-primary)] hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                Pregúntame sobre tu pipeline, tus leads calientes, o el ranking del equipo.
              </p>
            ) : (
              messages.map((m) => <ChatMessage key={m.id} message={m} />)
            )}
            {pending && <p className="text-xs text-muted-foreground">Pensando…</p>}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-border p-2.5">
            <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregunta rápido…"
                className="flex-1 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!input.trim() || pending}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-white disabled:opacity-40"
                aria-label="Enviar"
              >
                <Send className="size-3" />
              </button>
            </form>
            <Link
              href="/dashboard/assistant"
              className="mt-1.5 block text-center text-[10px] text-muted-foreground hover:text-[var(--color-cta)]"
            >
              Abrir conversación completa →
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex size-12 items-center justify-center rounded-full bg-[var(--color-cta)] text-white transition-transform hover:scale-105"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>
    </div>
  );
}
