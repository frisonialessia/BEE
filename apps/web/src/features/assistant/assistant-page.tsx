"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ChatMessage } from "@/components/assistant/chat-message";
import { useAssistantChat } from "@/features/assistant/use-assistant-chat";
import { useAuth } from "@/providers/auth-provider";

function greeting(t: ReturnType<typeof useTranslations>, hour: number): string {
  if (hour < 12) return t("greeting.morning");
  if (hour < 19) return t("greeting.afternoon");
  return t("greeting.evening");
}

/** Asistente BEE — página completa, historial de conversación en el hilo actual. */
export function AssistantPage() {
  const t = useTranslations("workspace.assistant.page");
  const tAssistant = useTranslations("workspace.assistant");
  const { user } = useAuth();
  const { messages, send, pending } = useAssistantChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const examples = [
    t("examples.pipeline"),
    t("examples.hotLeads"),
    t("examples.signalsThisWeek"),
    t("examples.teamRanking"),
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || pending) return;
    send(input);
    setInput("");
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {!hasMessages ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
          <span className="bee-assistant-gradient bee-assistant-halo flex size-14 items-center justify-center rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, mismo asset que el FAB (ask-bee-fab.tsx) */}
            <img src="/assistant-bee.svg" alt="" className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-2xl font-semibold tracking-tight">
              {greeting(t, new Date().getHours())}
              {user ? `, ${user.full_name.split(" ")[0]}` : ""}
            </p>
            <p className="mt-1 text-lg text-muted-foreground">{t("whatsOnMind")}</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-xl">
            <div className="flex items-center gap-2 rounded-[var(--radius-xl)] border border-border bg-[var(--color-card)] px-4 py-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("inputPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-white transition-opacity disabled:opacity-40"
                aria-label={t("sendAria")}
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </form>

          <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => send(ex)}
                className="rounded-[var(--radius-lg)] border border-border bg-[var(--color-card)] p-3 text-left text-xs text-muted-foreground transition-colors hover:border-[var(--color-cta)] hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain py-2">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="bee-assistant-gradient flex size-[17px] items-center justify-center rounded-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca */}
                  <img src="/assistant-bee.svg" alt="" className="size-2.5" aria-hidden="true" />
                </span>
                {tAssistant("thinking")}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-border pt-3">
            <div className="flex items-center gap-2 rounded-[var(--radius-xl)] border border-border bg-[var(--color-card)] px-4 py-2.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("inputPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!input.trim() || pending}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-white transition-opacity disabled:opacity-40"
                aria-label={t("sendAria")}
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
