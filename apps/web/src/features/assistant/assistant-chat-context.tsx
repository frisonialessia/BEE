"use client";

import { createContext, useContext } from "react";

import { useAssistantChat, type UseAssistantChat } from "@/features/assistant/use-assistant-chat";

/**
 * One `useAssistantChat()` instance shared by the full Asistente page and
 * the floating AskBeeFab, mounted once per dashboard/sandbox layout. Before
 * this, each consumer called the hook independently — two separate
 * `useState`s, two separate conversation ids — so a question asked in the
 * FAB didn't show up when you opened the full page right after, and vice
 * versa. Now both read from the same conversation, same as a real chat app.
 */
const AssistantChatContext = createContext<UseAssistantChat | null>(null);

export function AssistantChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useAssistantChat();
  return <AssistantChatContext.Provider value={chat}>{children}</AssistantChatContext.Provider>;
}

export function useAssistantChatContext(): UseAssistantChat {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) {
    throw new Error("useAssistantChatContext must be used within an AssistantChatProvider");
  }
  return ctx;
}
