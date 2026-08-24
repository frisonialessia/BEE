import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";

export interface OutboundWebhook {
  id: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  secret_preview: string;
  last_triggered_at: string | null;
  last_status: "success" | "failed" | null;
  failure_count: number;
  created_at: string;
}

/** Solo existe en la respuesta de creación — el secreto en texto plano no
 *  vuelve a mostrarse nunca después de este momento. */
export interface OutboundWebhookCreated extends OutboundWebhook {
  secret: string;
}

export interface OutboundWebhookCreateIn {
  url: string;
  event_types: string[];
  secret?: string;
}

export interface OutboundWebhookUpdateIn {
  url?: string;
  event_types?: string[];
  is_active?: boolean;
}

export async function fetchOutboundWebhooks(): Promise<FetchResult<OutboundWebhook[]>> {
  try {
    const data = await apiFetch<OutboundWebhook[]>("/api/v1/outbound-webhooks", { cache: "no-store" });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function fetchOutboundWebhookEventTypes(): Promise<string[]> {
  try {
    return await apiFetch<string[]>("/api/v1/outbound-webhooks/event-types", { cache: "no-store" });
  } catch {
    return ["opportunity.won", "opportunity.lost", "opportunity.ready_to_action"];
  }
}

export async function createOutboundWebhook(
  body: OutboundWebhookCreateIn,
): Promise<OutboundWebhookCreated> {
  return apiFetch<OutboundWebhookCreated>("/api/v1/outbound-webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateOutboundWebhook(
  id: string,
  body: OutboundWebhookUpdateIn,
): Promise<OutboundWebhook> {
  return apiFetch<OutboundWebhook>(`/api/v1/outbound-webhooks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteOutboundWebhook(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/outbound-webhooks/${id}`, { method: "DELETE" });
}
