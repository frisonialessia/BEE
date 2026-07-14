"use client";

/**
 * PendingActionsPanel — displays the AgentOrchestrator approval queue.
 *
 * Shows all actions waiting for explicit human approval before BEE can
 * execute any outbound interaction (email send, CRM update, etc.). The CEO
 * can review, approve, or reject each action from this panel.
 *
 * Security principle: no action is auto-executed. Every card in this panel
 * requires a deliberate click on "Approve" before anything happens externally.
 */

import { useState } from "react";
import { CheckCircle, Clock, Mail, XCircle } from "lucide-react";

import type { PendingAction } from "@/lib/types";

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  send_email: <Mail className="h-4 w-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  executing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

interface PendingActionCardProps {
  action: PendingAction;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

function PendingActionCard({ action, onApprove, onReject }: PendingActionCardProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function handleApprove() {
    setLoading("approve");
    try {
      await onApprove(action.id);
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    setLoading("reject");
    try {
      await onReject(action.id);
    } finally {
      setLoading(null);
    }
  }

  const isPending = action.status === "pending_approval";
  const statusLabel = action.status.replace(/_/g, " ");

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-500 flex-shrink-0">
            {ACTION_TYPE_ICONS[action.action_type] ?? <Clock className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 truncate">{action.title}</p>
            {action.description && (
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{action.description}</p>
            )}
          </div>
        </div>
        <span
          className={`flex-shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[action.status] ?? "bg-zinc-100 text-zinc-700"}`}
        >
          {statusLabel}
        </span>
      </div>

      {action.preview && isPending && (
        <div className="mt-3 rounded bg-zinc-50 p-2.5 text-xs text-zinc-600 font-mono whitespace-pre-wrap line-clamp-4 border border-zinc-100">
          {action.preview}
        </div>
      )}

      {action.retry_count > 0 && (
        <p className="mt-2 text-xs text-orange-600">Retry #{action.retry_count}</p>
      )}

      {isPending && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleApprove}
            disabled={!!loading}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {loading === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={handleReject}
            disabled={!!loading}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
            {loading === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      )}

      {action.approved_by && (
        <p className="mt-2 text-xs text-zinc-400">
          Approved by {action.approved_by}
          {action.approved_at && ` · ${new Date(action.approved_at).toLocaleDateString()}`}
        </p>
      )}
    </div>
  );
}

// ── Self-contained panel (fetches own data) ────────────────────────────────────

import { useEffect } from "react";
import { getPendingActions, approveAction, rejectAction } from "@/lib/api";
import { ShieldCheck } from "lucide-react";

export function PendingActionsPanel() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPendingActions(20).then((res) => {
      setActions(res.data);
      setLoading(false);
    });
  }, []);

  async function handleApprove(id: string) {
    await approveAction(id, "CEO");
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "approved" as const } : a))
    );
  }

  async function handleReject(id: string) {
    await rejectAction(id);
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "rejected" as const } : a))
    );
  }

  const pendingCount = actions.filter((a) => a.status === "pending_approval").length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Execution Queue
          </h3>
          <p className="text-xs text-zinc-500">
            Actions awaiting approval before BEE executes externally
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">
            {pendingCount} pending
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle className="mx-auto h-6 w-6 text-emerald-500 mb-2" />
          <p className="text-xs text-zinc-400">No pending actions.</p>
          <p className="text-[10px] text-zinc-600 mt-1">
            Execution artifacts will appear here when BEE generates them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-600 flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" />
        Security gate: no action executes without explicit CEO approval.
      </p>
    </div>
  );
}
