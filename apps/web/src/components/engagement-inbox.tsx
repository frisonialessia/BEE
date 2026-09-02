"use client";

/**
 * EngagementInbox — SmartEngagementEngine dashboard widget.
 *
 * Shows incoming engagement events (LinkedIn comments, DMs, X replies)
 * with their AI-generated sentiment/intent classification and response drafts.
 *
 * Every response draft has a PendingAction in the AgentOrchestrator —
 * the CEO reviews and approves before anything is sent (authenticity gate).
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getEngagementEvents, submitEngagementEvent } from "@/lib/api";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EngagementEvent } from "@/lib/types";

const SENTIMENT_VARIANT: Record<string, BadgeProps["variant"]> = {
  positive: "success",
  neutral: "outline",
  negative: "destructive",
  question: "default",
  unknown: "outline",
};

const INTENT_VARIANT: Record<string, BadgeProps["variant"]> = {
  sales_interest: "warning",
  objection: "destructive",
  referral: "default",
  follow_up: "outline",
  compliment: "success",
  spam: "outline",
  other: "outline",
};

const SOURCE_ICONS: Record<string, string> = {
  linkedin: "in",
  twitter: "𝕏",
  email: "✉",
  slack: "#",
  other: "?",
};

function EventCard({ event }: { event: EngagementEvent }) {
  const t = useTranslations("workspace.sequences.engagementInbox");
  const [expanded, setExpanded] = useState(false);

  if (event.ignored) return null;

  return (
    <div className="bee-surface space-y-2 p-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bee-caption w-5 text-center font-bold">
            {SOURCE_ICONS[event.source] ?? "?"}
          </span>
          <span className="text-xs font-medium">
            {event.author_name ?? event.author_handle ?? t("anonymous")}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Badge variant={SENTIMENT_VARIANT[event.sentiment] ?? "outline"}>
            {t.has(`sentiment.${event.sentiment}`) ? t(`sentiment.${event.sentiment}`) : event.sentiment}
          </Badge>
          <Badge variant={INTENT_VARIANT[event.intent] ?? "outline"}>
            {t.has(`intent.${event.intent}`) ? t(`intent.${event.intent}`) : event.intent}
          </Badge>
        </div>
      </div>

      {/* Content preview */}
      <p className="bee-caption line-clamp-2">{event.content}</p>

      {/* Draft indicator */}
      {event.response_draft && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-[var(--color-chart-2)] hover:underline"
        >
          {expanded ? t("hideDraft") : t("showDraft")}
        </button>
      )}

      {expanded && event.response_draft && (
        <div className="bee-inset p-2.5">
          <p className="whitespace-pre-wrap text-xs">{event.response_draft}</p>
          {event.pending_action_id && (
            <p className="mt-1.5 text-xs font-medium text-[var(--color-chart-2)]">
              {t("waitingApproval")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EngagementInboxPanel() {
  const t = useTranslations("workspace.sequences.engagementInbox");
  const [events, setEvents] = useState<EngagementEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [source, setSource] = useState("linkedin");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const result = await getEngagementEvents();
    setEvents(result.data);
    setLoading(false);
  }

  useEffect(() => {
    // one-time mount fetch, not a render-loop; load() itself gates its own
    // setState calls behind the async response, not synchronously in the
    // effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function handleSubmit() {
    if (!content) return;
    setSubmitting(true);
    try {
      await submitEngagementEvent({ source, content, author_name: author || undefined });
      setContent("");
      setAuthor("");
      setShowSubmit(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const actionable = events.filter((e) => !e.ignored && e.pending_action_id);

  return (
    <div className="bee-panel space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="bee-panel__title">{t("title")}</h3>
          <p className="bee-panel__subtitle">{t("subtitle")}</p>
        </div>
        <button onClick={() => setShowSubmit(!showSubmit)} className="bee-btn-ghost">
          {t("simulateEvent")}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bee-inset p-2">
          <p className="bee-stat__val">{events.length}</p>
          <p className="bee-stat__lbl">{t("stats.total")}</p>
        </div>
        <div className="bee-bento bee-bento--warm p-2">
          <p className="bee-stat__val">{actionable.length}</p>
          <p className="bee-stat__lbl">{t("stats.needsApproval")}</p>
        </div>
        <div className="bee-bento bee-bento--primary p-2">
          <p className="bee-stat__val">
            {events.filter((e) => e.intent === "sales_interest").length}
          </p>
          <p className="bee-stat__lbl">{t("stats.salesLeads")}</p>
        </div>
      </div>

      {/* Submit form */}
      {showSubmit && (
        <div className="bee-inset space-y-3 p-4">
          <p className="bee-eyebrow">{t("form.title")}</p>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="bee-input">
            <option value="linkedin">{t("form.sources.linkedin")}</option>
            <option value="twitter">{t("form.sources.twitter")}</option>
            <option value="email">{t("form.sources.email")}</option>
          </select>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={t("form.authorPlaceholder")}
            className="bee-input"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("form.contentPlaceholder")}
            rows={3}
            className="bee-input"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || !content}
              className="bee-btn bee-btn--primary"
            >
              {submitting ? t("form.analyzing") : t("form.analyze")}
            </button>
            <button onClick={() => setShowSubmit(false)} className="bee-btn">
              {t("form.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : events.filter((e) => !e.ignored).length === 0 ? (
        <p className="bee-caption py-4 text-center">{t("empty")}</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
