"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { fetchSignalStream } from "@/lib/api/control";
import { findNewReadyEvents } from "@/lib/control/pipeline-builder";
import { queryKeys } from "@/lib/query-keys";

/** Polls the signal pipeline every 8s and toasts when new strategies are ready. */
export function useSignalStream(limit = 40, pollMs = 8_000) {
  const seenReadyRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const t = useTranslations("common.toasts");

  const query = useQuery({
    queryKey: queryKeys.control.signalStream(limit),
    queryFn: async () => fetchSignalStream(limit),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
    staleTime: 4_000,
  });

  const events = useMemo(() => query.data?.data.events ?? [], [query.data?.data.events]);

  useEffect(() => {
    if (!query.data?.data) return;

    const readyEvents = events.filter((e) => e.stage === "ready");

    if (!initializedRef.current) {
      for (const e of readyEvents) seenReadyRef.current.add(e.id);
      initializedRef.current = true;
      return;
    }

    const fresh = findNewReadyEvents(events, seenReadyRef.current);
    for (const event of fresh) {
      seenReadyRef.current.add(event.id);
      toast.success(t("strategyReady"), {
        description: event.title,
        duration: 8_000,
      });
    }
  }, [events, query.data?.data, t]);

  return query;
}
