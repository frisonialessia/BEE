/**
 * BEE Copilot — `/api/v1/assistant`.
 *
 * `getAssistantStatus` tells the UI whether the deployment has a model
 * behind the assistant; when it doesn't (or the sandbox), the hook keeps
 * the client-side rule engine (lib/assistant/intent-router.ts), so the
 * copilot is strictly additive.
 */

import { apiFetch } from "@/lib/api/client";

export type AssistantRole = "user" | "assistant";

export interface AssistantToolCall {
  name: string;
  summary: string;
  mutates: boolean;
}

export interface AssistantToolInfo {
  name: string;
  description: string;
  mutates: boolean;
}

export interface AssistantStatus {
  available: boolean;
  provider: string;
  model: string | null;
  tools: AssistantToolInfo[];
}

export interface AssistantChatResponse {
  reply: string;
  tool_calls: AssistantToolCall[];
  provider: string;
  model: string | null;
}

export function getAssistantStatus(): Promise<AssistantStatus> {
  return apiFetch<AssistantStatus>("/api/v1/assistant/status", { cache: "no-store" });
}

export function chatWithAssistant(
  messages: { role: AssistantRole; content: string }[],
  locale: "es" | "en",
): Promise<AssistantChatResponse> {
  return apiFetch<AssistantChatResponse>("/api/v1/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, locale }),
  });
}
