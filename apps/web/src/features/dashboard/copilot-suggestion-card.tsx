"use client";

import { useTranslations } from "next-intl";

import { useExplanation } from "@/features/dashboard/decision-feed";
import { useAssistantChatContext } from "@/features/assistant/assistant-chat-context";
import { useTodayFeed } from "@/hooks/queries/use-priority-feed";
import { Skeleton } from "@/components/ui/skeleton";
import type { DecisionCard } from "@/types/extended";

/** The exact top card `GET /priority/today` already ranked first for
 *  DecisionFeed — server-ranked, real, nothing recomputed here — framed
 *  as the copilot's own pick instead of a feed row, with a button that
 *  opens the assistant already asking about it (askInFab, see
 *  assistant-chat-context.tsx). "El agente de IA" gets a seat on Resumen
 *  itself, not just the floating button. */
function Suggestion({ card }: { card: DecisionCard }) {
  const t = useTranslations("dashboardOverview.overview.sections.copilot");
  const { headline, reasoning } = useExplanation(card);
  const { askInFab } = useAssistantChatContext();

  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="bee-assistant-gradient flex size-8 shrink-0 items-center justify-center rounded-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, mismo asset que el FAB */}
          <img src="/assistant-bee.svg" alt="" className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{headline}</p>
          <p className="bee-caption mt-1 line-clamp-2">{reasoning}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => askInFab(`${headline} — ${reasoning}`)}
        className="bee-btn bee-btn--primary w-full !text-sm"
      >
        {t("askButton")}
      </button>
    </div>
  );
}

export function CopilotSuggestionCard() {
  const t = useTranslations("dashboardOverview.overview.sections.copilot");
  const { data, isLoading } = useTodayFeed();
  const top = data?.data.cards[0];

  if (isLoading) return <Skeleton className="h-full min-h-[8rem]" />;
  if (!top) return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
  return <Suggestion card={top} />;
}
