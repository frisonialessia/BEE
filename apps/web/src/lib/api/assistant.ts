/**
 * BEE Copilot — `/api/v1/assistant`.
 *
 * `getAssistantStatus` tells the UI whether the deployment has a model
 * behind the assistant; when it doesn't (or the sandbox), the hook keeps
 * the client-side rule engine (lib/assistant/intent-router.ts), so the
 * copilot is strictly additive.
 *
 * The conversation endpoints below only ever have anything to show when
 * that model-backed copilot is actually running `POST /assistant/chat` —
 * the local rule engine (demo mode, or a deployment with no AI provider
 * configured) never calls it, so there's nothing to persist. Callers gate
 * these on `engine === "copilot"`, not on demo mode specifically; the demo
 * guards below are just a second line of defense against the sandbox
 * hitting a network a real org's session wouldn't have anyway.
 */

import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";

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
  conversation_id: string;
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
}

export interface AssistantConversationMessage {
  role: AssistantRole;
  content: string;
  created_at: string;
}

export interface AssistantConversationDetail extends AssistantConversationSummary {
  messages: AssistantConversationMessage[];
}

export function getAssistantStatus(): Promise<AssistantStatus> {
  return apiFetch<AssistantStatus>("/api/v1/assistant/status", { cache: "no-store" });
}

export function chatWithAssistant(
  messages: { role: AssistantRole; content: string }[],
  locale: "es" | "en",
  conversationId?: string | null,
): Promise<AssistantChatResponse> {
  return apiFetch<AssistantChatResponse>("/api/v1/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, locale, conversation_id: conversationId ?? undefined }),
  });
}

export function fetchAssistantConversations(): Promise<AssistantConversationSummary[]> {
  if (isDemoMode()) return Promise.resolve([]);
  return apiFetch<AssistantConversationSummary[]>("/api/v1/assistant/conversations", { cache: "no-store" });
}

export function fetchAssistantConversation(conversationId: string): Promise<AssistantConversationDetail> {
  return apiFetch<AssistantConversationDetail>(`/api/v1/assistant/conversations/${conversationId}`, {
    cache: "no-store",
  });
}

export function deleteAssistantConversation(conversationId: string): Promise<void> {
  if (isDemoMode()) return Promise.resolve();
  return apiFetch<void>(`/api/v1/assistant/conversations/${conversationId}`, { method: "DELETE" });
}
