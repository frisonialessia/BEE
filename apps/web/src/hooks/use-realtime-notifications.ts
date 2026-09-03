"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getApiBaseUrl } from "@/lib/api/client";
import { getStoredToken } from "@/lib/auth-storage";
import { isDemoMode } from "@/lib/demo/mode";
import { queryKeys } from "@/lib/query-keys";

/** Event types RealtimeNotificationHandler/the meeting.completed listener
 * on the backend actually publish — see
 * app.services.workflow_orchestrator.handlers.RealtimeNotificationHandler
 * and app.services.events.listeners' meeting.completed notify listener.
 * Kept in sync by hand, same convention
 * OutboundWebhookHandler.event_types documents for its own list.
 *
 * Plain Spanish strings, not next-intl — NotificationBell (the only
 * caller of this hook) has no i18n namespace of its own to extend either;
 * matches that component's own existing convention. */
const TOAST_COPY: Record<string, (company: string) => string> = {
  "opportunity.ready_to_action": (company) => `Battlecard lista para ${company}.`,
  "opportunity.won": (company) => `🎉 Oportunidad ganada: ${company}.`,
  "opportunity.lost": (company) => `Oportunidad perdida: ${company}.`,
  "meeting.completed": () => "Reunión completada — el pipeline se actualizó.",
};

const RECONNECT_DELAY_MS = 5000;

/** Subscribes to GET /notifications/stream (SSE) for the lifetime of the
 * mounted component and, on every message, invalidates the query caches
 * useNotifications() (src/hooks/use-notifications.ts) derives its badge
 * from — so a hot signal lands in the bell within the same second it
 * happens, instead of waiting for that hook's own 30s poll.
 *
 * Deliberately invalidates rather than parsing the SSE payload into a
 * notification shape itself: useNotifications()'s own
 * buildNotifications() is already the single source of truth for what a
 * notification looks like, and this only needs to trigger a refetch, not
 * duplicate that logic.
 *
 * Self-contained: no-ops entirely in the demo sandbox (there's no real
 * backend session to stream from) and when there's no stored session
 * token. A missing/misconfigured Redis on the backend degrades to the
 * stream sending one "unavailable" event and closing — this hook simply
 * stops reconnecting when that happens, and the 30s poll elsewhere
 * keeps working exactly as before; nothing here is a hard dependency.
 */
export function useRealtimeNotifications(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isDemoMode()) return;
    const token = getStoredToken();
    if (!token || typeof window === "undefined" || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function refreshNotificationSources() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.control.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all });
      // The manual_review_required audit query in use-notifications.ts
      // uses an ad hoc key, not the shared registry (a pre-existing
      // inconsistency, not introduced here) — invalidateQueries matches
      // by prefix, so this still reaches it.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }

    function connect() {
      if (stopped) return;
      const url = `${getApiBaseUrl()}/api/v1/notifications/stream?token=${encodeURIComponent(token as string)}`;
      source = new EventSource(url);

      source.addEventListener("unavailable", () => {
        // No Redis configured server-side (see that endpoint's own
        // docstring) — nothing will ever arrive on this connection.
        // Stop reconnecting; the 30s poll is this session's only source
        // of truth from here on, same as before this hook existed.
        stopped = true;
        source?.close();
      });

      source.onmessage = (event: MessageEvent<string>) => {
        refreshNotificationSources();
        try {
          const data = JSON.parse(event.data) as { event_type?: string; company_name?: string };
          const buildToast = data.event_type ? TOAST_COPY[data.event_type] : undefined;
          if (buildToast) {
            toast(buildToast(data.company_name ?? "esta cuenta"));
          }
        } catch {
          // Malformed/unexpected payload — the invalidation above already
          // happened, that's the part that actually matters.
        }
      };

      source.onerror = () => {
        source?.close();
        if (!stopped) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [queryClient]);
}
