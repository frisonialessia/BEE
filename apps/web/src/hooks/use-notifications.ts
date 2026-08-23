"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { getAuditDecisions } from "@/lib/api";
import { useHiveLeads } from "@/hooks/queries/use-lead-board";
import { useSignals } from "@/hooks/queries/use-signals";
import { buildNotifications } from "@/lib/notifications/build-notifications";

const LAST_SEEN_KEY = "bee.notifications.lastSeen";

function readLastSeen(): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

export function useNotifications() {
  const { data: hiveResult, isLoading: hiveLoading } = useHiveLeads(200);
  const { data: signalsResult, isLoading: signalsLoading } = useSignals(100);
  const { data: reviewResult, isLoading: reviewLoading } = useQuery({
    queryKey: ["notifications", "review-required"],
    queryFn: async () => getAuditDecisions({ manual_review_required: true, limit: 20 }),
    refetchInterval: 30_000,
  });
  // Sin esto, la campana muestra "no hay novedades" en el primer render —
  // antes de que las tres queries de arriba respondan — como si ya
  // hubiera confirmado que no hay nada, en vez de seguir cargando.
  const isLoading = hiveLoading || signalsLoading || reviewLoading;

  const [lastSeen, setLastSeen] = useState<string>(() => readLastSeen());

  const notifications = buildNotifications({
    hotLeads: hiveResult?.data ?? [],
    signals: signalsResult?.data ?? [],
    reviewEntries: reviewResult?.data ?? [],
  });

  const unreadCount = notifications.filter(
    (n) => new Date(n.timestamp).getTime() > new Date(lastSeen).getTime(),
  ).length;

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString();
    setLastSeen(now);
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, now);
    } catch {
      /* localStorage unavailable — badge just won't persist across reloads */
    }
  }, []);

  return { notifications, unreadCount, markAllSeen, isLoading };
}
