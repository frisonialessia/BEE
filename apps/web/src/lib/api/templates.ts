import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";

export interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  created_at: string;
}

export interface MessageTemplateCreateIn {
  name: string;
  channel: string;
  subject?: string;
  body: string;
}

export interface MessageTemplateUpdateIn {
  name?: string;
  channel?: string;
  subject?: string | null;
  body?: string;
}

export async function fetchTemplates(limit = 100): Promise<FetchResult<MessageTemplate[]>> {
  try {
    const data = await apiFetch<MessageTemplate[]>(`/api/v1/templates?limit=${limit}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function createTemplate(body: MessageTemplateCreateIn): Promise<MessageTemplate> {
  return apiFetch<MessageTemplate>("/api/v1/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTemplate(
  templateId: string,
  body: MessageTemplateUpdateIn,
): Promise<MessageTemplate> {
  return apiFetch<MessageTemplate>(`/api/v1/templates/${templateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/templates/${templateId}`, { method: "DELETE" });
}
