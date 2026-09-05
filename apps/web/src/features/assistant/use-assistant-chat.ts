"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useAssistantConversations, useDeleteAssistantConversation } from "@/hooks/queries/use-assistant-conversations";
import { useHiveLeads, useLeadBoard } from "@/hooks/queries/use-lead-board";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import { getClientLocale } from "@/i18n/client-locale";
import { chatWithAssistant, fetchAssistantConversation, getAssistantStatus } from "@/lib/api/assistant";
import type { AssistantConversationSummary, AssistantToolCall } from "@/lib/api/assistant";
import { routeAssistantMessage } from "@/lib/assistant/intent-router";
import { useIsDemoMode } from "@/lib/demo/mode";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Tools the copilot ran to produce this reply — the audit trail shown
   *  under the bubble. Absent for the local rule engine. */
  toolCalls?: AssistantToolCall[];
}

export type AssistantEngine = "copilot" | "local";

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

// Kept as a local constant rather than in lib/query-keys: nothing else
// invalidates it — the status only changes with a deployment's env vars.
const STATUS_KEY = ["assistant", "status"] as const;
const MAX_HISTORY = 20;

/**
 * Cerebro compartido del Asistente BEE — la página completa y el cuadro
 * flotante usan este mismo hook (a través de AssistantChatProvider, ver
 * assistant-chat-context.tsx, así que preguntar aquí o allá comparte el
 * mismo hilo/conversación guardada, no dos independientes), así que
 * responden igual sin duplicar lógica.
 *
 * Dos motores, una interfaz: cuando el despliegue tiene un proveedor de IA
 * (`GET /assistant/status` → available), cada mensaje va a
 * `POST /assistant/chat`, donde el modelo consulta (y, si se lo piden,
 * modifica) el pipeline real con herramientas acotadas a la organización —
 * y esa misma llamada guarda el turno en `conversation_id` para que el
 * historial sobreviva un refresh y aparezca en la lista de conversaciones.
 * Sin proveedor — o en el sandbox — se usa el motor de reglas local
 * (`routeAssistantMessage`) sobre los datos que la página ya cargó, igual
 * que antes; ese motor nunca guarda nada (no hay nada real que guardar). Si
 * la llamada de red falla a mitad de conversación, esa respuesta cae
 * también al motor local en vez de dejar el hilo mudo.
 */
export function useAssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const isDemo = useIsDemoMode();

  const { data: status } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: getAssistantStatus,
    enabled: !isDemo,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const engine: AssistantEngine = !isDemo && status?.available ? "copilot" : "local";

  const { data: conversations, isLoading: conversationsLoading } = useAssistantConversations(engine === "copilot");
  const deleteConversationMutation = useDeleteAssistantConversation();

  const { data: signalsResult } = useSignals();
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: boardResult } = useLeadBoard(200);
  const { data: hiveResult } = useHiveLeads(200);
  const { data: usersResult } = useUsers();

  const answerLocally = useCallback(
    (text: string) =>
      routeAssistantMessage(text, {
        signals: signalsResult?.data ?? [],
        opportunities: oppsResult?.data ?? [],
        leadCards: boardResult?.cards ?? [],
        hotLeads: hiveResult?.data ?? [],
        users: usersResult ?? [],
      }),
    [signalsResult, oppsResult, boardResult, hiveResult, usersResult],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMessage: AssistantMessage = { id: nextId(), role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setPending(true);

      if (engine === "local") {
        // El pequeño retraso solo hace que la conversación se sienta
        // natural en vez de aparecer de golpe.
        window.setTimeout(() => {
          setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: answerLocally(trimmed) }]);
          setPending(false);
        }, 400);
        return;
      }

      setMessages((current) => {
        const history = [...current, userMessage]
          .slice(-MAX_HISTORY)
          .map((m) => ({ role: m.role, content: m.text }));
        void chatWithAssistant(history, getClientLocale(), conversationId)
          .then((res) => {
            setConversationId(res.conversation_id);
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: "assistant", text: res.reply, toolCalls: res.tool_calls },
            ]);
          })
          .catch(() => {
            setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: answerLocally(trimmed) }]);
          })
          .finally(() => setPending(false));
        return current;
      });
    },
    [engine, answerLocally, conversationId],
  );

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const openConversation = useCallback((id: string) => {
    setPending(true);
    void fetchAssistantConversation(id)
      .then((detail) => {
        setConversationId(detail.id);
        setMessages(detail.messages.map((m) => ({ id: nextId(), role: m.role, text: m.content })));
      })
      .finally(() => setPending(false));
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      deleteConversationMutation.mutate(id);
      if (id === conversationId) startNewConversation();
    },
    [deleteConversationMutation, conversationId, startNewConversation],
  );

  return {
    messages,
    send,
    pending,
    engine,
    model: status?.model ?? null,
    conversationId,
    conversations: conversations as AssistantConversationSummary[] | undefined,
    conversationsLoading,
    startNewConversation,
    openConversation,
    deleteConversation,
  };
}

export type UseAssistantChat = ReturnType<typeof useAssistantChat>;
