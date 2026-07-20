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

import { useEffect, useState } from "react";
import { getEngagementEvents, submitEngagementEvent } from "@/lib/api";
import type { EngagementEvent } from "@/lib/types";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-green-400",
  neutral: "text-zinc-400",
  negative: "text-red-400",
  question: "text-blue-400",
  unknown: "text-zinc-600",
};

const INTENT_LABELS: Record<string, string> = {
  sales_interest: "Sales Interest",
  objection: "Objection",
  referral: "Referral",
  follow_up: "Follow-up",
  compliment: "Compliment",
  spam: "Spam",
  other: "Other",
};

const INTENT_COLORS: Record<string, string> = {
  sales_interest: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  objection: "bg-red-500/10 text-red-400 border-red-500/20",
  referral: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  follow_up: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  compliment: "bg-green-500/10 text-green-400 border-green-500/20",
  spam: "bg-zinc-800 text-zinc-600 border-zinc-700",
  other: "bg-zinc-800 text-zinc-500 border-zinc-700",
};

const SOURCE_ICONS: Record<string, string> = {
  linkedin: "in",
  twitter: "𝕏",
  email: "✉",
  slack: "#",
  other: "?",
};

function EventCard({ event }: { event: EngagementEvent }) {
  const [expanded, setExpanded] = useState(false);

  if (event.ignored) return null;

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 w-5 text-center">
            {SOURCE_ICONS[event.source] ?? "?"}
          </span>
          <span className="text-xs font-medium text-[var(--color-background)]">
            {event.author_name ?? event.author_handle ?? "Anonymous"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-xs ${SENTIMENT_COLORS[event.sentiment]}`}>{event.sentiment}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded border ${INTENT_COLORS[event.intent]}`}
          >
            {INTENT_LABELS[event.intent] ?? event.intent}
          </span>
        </div>
      </div>

      {/* Content preview */}
      <p className="text-xs text-zinc-400 line-clamp-2">{event.content}</p>

      {/* Draft indicator */}
      {event.response_draft && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-amber-400 hover:text-amber-300"
        >
          {expanded ? "▲ Hide draft" : "▼ Show response draft"}
        </button>
      )}

      {expanded && event.response_draft && (
        <div className="rounded border border-amber-500/20 bg-amber-950/20 p-2.5">
          <p className="text-xs text-zinc-300 whitespace-pre-wrap">{event.response_draft}</p>
          {event.pending_action_id && (
            <p className="text-xs text-amber-500 mt-1.5">
              Awaiting CEO approval in orchestrator
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EngagementInboxPanel() {
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

  useEffect(() => { void load(); }, []);

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
    <div className="rounded-none border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-background)]">Engagement Inbox</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Incoming comments, DMs, and replies — classified and drafted by AI
          </p>
        </div>
        <button
          onClick={() => setShowSubmit(!showSubmit)}
          className="text-xs px-3 py-1.5 rounded-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
        >
          + Simulate Event
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-sm bg-zinc-800/50 p-2">
          <p className="text-lg font-bold text-[var(--color-background)]">{events.length}</p>
          <p className="text-xs text-zinc-500">Total</p>
        </div>
        <div className="rounded-sm bg-amber-500/10 p-2">
          <p className="text-lg font-bold text-amber-400">{actionable.length}</p>
          <p className="text-xs text-zinc-500">Need approval</p>
        </div>
        <div className="rounded-sm bg-green-500/10 p-2">
          <p className="text-lg font-bold text-green-400">
            {events.filter((e) => e.intent === "sales_interest").length}
          </p>
          <p className="text-xs text-zinc-500">Sales leads</p>
        </div>
      </div>

      {/* Submit form */}
      {showSubmit && (
        <div className="rounded-sm border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--color-background)]">Simulate Incoming Event</p>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] focus:outline-none focus:border-amber-500"
          >
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">X (Twitter)</option>
            <option value="email">Email</option>
          </select>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author name (optional)"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste a comment or message..."
            rows={3}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || !content}
              className="text-xs px-3 py-1.5 bg-amber-500 text-black rounded font-medium disabled:opacity-50"
            >
              {submitting ? "Processing..." : "Analyse & Draft"}
            </button>
            <button
              onClick={() => setShowSubmit(false)}
              className="text-xs px-3 py-1.5 bg-zinc-700 text-zinc-400 rounded hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-sm bg-zinc-800" />
          ))}
        </div>
      ) : events.filter((e) => !e.ignored).length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-4">
          No events yet. Use "Simulate Event" to test the SmartEngagementEngine.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
