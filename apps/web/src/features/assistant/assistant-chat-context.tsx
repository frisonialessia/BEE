"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { useAssistantChat, type UseAssistantChat } from "@/features/assistant/use-assistant-chat";

interface AssistantChatContextValue extends UseAssistantChat {
  /** Whether the floating panel (ask-bee-fab.tsx) is open — lifted out of
   *  that component so any other part of the dashboard (e.g. Resumen's
   *  "Copiloto BEE" card) can open it itself, optionally already asking
   *  something, instead of only the FAB's own toggle button. */
  fabOpen: boolean;
  setFabOpen: (open: boolean) => void;
  /** Opens the panel and sends `text` through the same `send()` the FAB's
   *  own form uses — one call for "surface the copilot, already asking
   *  this," used by prompt-style cards elsewhere on the dashboard. */
  askInFab: (text: string) => void;
}

/**
 * One `useAssistantChat()` instance shared by the full Asistente page and
 * the floating AskBeeFab, mounted once per dashboard/sandbox layout. Before
 * this, each consumer called the hook independently — two separate
 * `useState`s, two separate conversation ids — so a question asked in the
 * FAB didn't show up when you opened the full page right after, and vice
 * versa. Now both read from the same conversation, same as a real chat app.
 */
const AssistantChatContext = createContext<AssistantChatContextValue | null>(null);

export function AssistantChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useAssistantChat();
  const [fabOpen, setFabOpen] = useState(false);
  const askInFab = useCallback(
    (text: string) => {
      setFabOpen(true);
      chat.send(text);
    },
    [chat],
  );
  return (
    <AssistantChatContext.Provider value={{ ...chat, fabOpen, setFabOpen, askInFab }}>
      {children}
    </AssistantChatContext.Provider>
  );
}

export function useAssistantChatContext(): AssistantChatContextValue {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) {
    throw new Error("useAssistantChatContext must be used within an AssistantChatProvider");
  }
  return ctx;
}
