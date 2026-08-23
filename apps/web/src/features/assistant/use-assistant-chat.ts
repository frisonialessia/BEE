"use client";

import { useCallback, useState } from "react";

import { useHiveLeads, useLeadBoard } from "@/hooks/queries/use-lead-board";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import { routeAssistantMessage } from "@/lib/assistant/intent-router";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

/**
 * Cerebro compartido del Asistente BEE — la página completa y el cuadro
 * flotante usan este mismo hook, así que responden igual sin duplicar
 * lógica. Reemplazar el motor de reglas por un modelo real más adelante
 * solo toca `routeAssistantMessage`, no este hook ni la UI.
 */
export function useAssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);

  const { data: signalsResult } = useSignals();
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: boardResult } = useLeadBoard(200);
  const { data: hiveResult } = useHiveLeads(200);
  const { data: usersResult } = useUsers();

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
      setPending(true);

      // Sin llamada de red todavía (motor de reglas, ver intent-router) —
      // el pequeño retraso solo hace que la conversación se sienta natural
      // en vez de aparecer de golpe.
      window.setTimeout(() => {
        const reply = routeAssistantMessage(trimmed, {
          signals: signalsResult?.data ?? [],
          opportunities: oppsResult?.data ?? [],
          leadCards: boardResult?.cards ?? [],
          hotLeads: hiveResult?.data ?? [],
          users: usersResult ?? [],
        });
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: reply }]);
        setPending(false);
      }, 400);
    },
    [signalsResult, oppsResult, boardResult, hiveResult, usersResult],
  );

  return { messages, send, pending };
}
