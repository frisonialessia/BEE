"use client";

import { History, Plus, Send, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ChatMessage } from "@/components/assistant/chat-message";
import { useAssistantChatContext } from "@/features/assistant/assistant-chat-context";
import type { Locale } from "@/i18n/locales";
import { useAuth } from "@/providers/auth-provider";

function greeting(t: ReturnType<typeof useTranslations>, hour: number): string {
  if (hour < 12) return t("greeting.morning");
  if (hour < 19) return t("greeting.afternoon");
  return t("greeting.evening");
}

function formatConversationDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Asistente BEE — página completa, con el historial de conversaciones
 *  guardadas del usuario a la izquierda (solo cuando hay copiloto real
 *  detrás — ver use-assistant-chat.ts: el motor local nunca guarda nada). */
export function AssistantPage() {
  const t = useTranslations("workspace.assistant.page");
  const tAssistant = useTranslations("workspace.assistant");
  const tHistory = useTranslations("workspace.assistant.history");
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const {
    messages,
    send,
    pending,
    engine,
    conversationId,
    conversations,
    startNewConversation,
    openConversation,
    deleteConversation,
  } = useAssistantChatContext();
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const showHistory = engine === "copilot";

  return (
    <div className="flex h-full gap-4">
      {showHistory && (
        <>
          {historyOpen && (
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label={tHistory("toggleAria")}
              className="fixed inset-0 z-30 bg-black/30 sm:hidden"
            />
          )}
          <aside
            className={`${historyOpen ? "fixed inset-y-0 left-0 z-40 flex w-64 bg-[var(--color-background)] p-3 shadow-xl" : "hidden"} shrink-0 flex-col sm:static sm:z-auto sm:flex sm:w-56 sm:bg-transparent sm:p-0 sm:shadow-none sm:border-r sm:border-border sm:pr-3`}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="bee-caption">{tHistory("title")}</p>
              <button
                type="button"
                onClick={() => {
                  startNewConversation();
                  setHistoryOpen(false);
                }}
                aria-label={tHistory("new")}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--color-card)] hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              {!conversations || conversations.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tHistory("empty")}</p>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 ${
                      c.id === conversationId ? "bg-[var(--color-card)]" : "hover:bg-[var(--color-card)]/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        openConversation(c.id);
                        setHistoryOpen(false);
                      }}
                      aria-label={tHistory("openAria")}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs text-foreground">{c.title}</p>
                      <p className="bee-micro text-muted-foreground">{formatConversationDate(c.last_message_at, locale)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                      aria-label={tHistory("deleteAria")}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {showHistory && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="mb-2 flex shrink-0 items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          >
            <History className="size-3.5" />
            {tHistory("title")}
          </button>
        )}

        {!hasMessages ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
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
              <p className="bee-caption mt-2">{tAssistant(`engine.${engine}`)}</p>
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-xl">
              <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-[var(--color-card)] px-4 py-3">
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
              <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-[var(--color-card)] px-4 py-3">
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
    </div>
  );
}
