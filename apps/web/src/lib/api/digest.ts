/**
 * Daily digest — `/organizations/digest`. "La jugada de hoy" posted once a
 * day to a Slack/Teams incoming webhook. The URL is write-only: the API
 * returns a hint (last characters), never the full secret.
 */

import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";

export interface DigestSettings {
  enabled: boolean;
  hour_utc: number;
  webhook_configured: boolean;
  webhook_url_hint: string | null;
  last_sent_at: string | null;
}

export interface DigestSettingsIn {
  webhook_url?: string;
  enabled?: boolean;
  hour_utc?: number;
}

export type DigestSkipReason =
  | "not_configured"
  | "disabled"
  | "already_sent_today"
  | "not_the_hour"
  | "delivery_failed";

export interface DigestSendResult {
  sent: boolean;
  reason: DigestSkipReason | null;
  cards: number;
}

const DEMO_SETTINGS: DigestSettings = {
  enabled: true,
  hour_utc: 8,
  webhook_configured: true,
  webhook_url_hint: "…a1b2c3",
  last_sent_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
};

export async function fetchDigestSettings(): Promise<DigestSettings> {
  if (isDemoMode()) return DEMO_SETTINGS;
  return apiFetch<DigestSettings>("/api/v1/organizations/digest", { cache: "no-store" });
}

export async function updateDigestSettings(body: DigestSettingsIn): Promise<DigestSettings> {
  if (isDemoMode()) return { ...DEMO_SETTINGS, ...body, webhook_configured: true };
  return apiFetch<DigestSettings>("/api/v1/organizations/digest", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendDigestNow(): Promise<DigestSendResult> {
  if (isDemoMode()) return { sent: true, reason: null, cards: 3 };
  return apiFetch<DigestSendResult>("/api/v1/organizations/digest/send", { method: "POST" });
}
