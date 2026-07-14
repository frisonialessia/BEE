"use client";

import { useEffect, useState } from "react";
import { Zap, CheckCircle2, Clock, XCircle, AlertTriangle, Layers } from "lucide-react";
import { getWorkflowStatus, getWorkflowTasks } from "@/lib/api";
import type { WorkflowStatus, WorkflowTask } from "@/lib/types";

const STATUS_ICON = {
  mock_dispatched: <Layers className="h-3 w-3 text-zinc-400" />,
  dispatched: <Zap className="h-3 w-3 text-blue-400" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-400" />,
  failed: <XCircle className="h-3 w-3 text-red-400" />,
  pending: <Clock className="h-3 w-3 text-yellow-400" />,
  skipped: <AlertTriangle className="h-3 w-3 text-zinc-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  mock_dispatched: "Mock",
  dispatched: "Dispatched",
  completed: "Completed",
  failed: "Failed",
  pending: "Pending",
  skipped: "Skipped",
};

const STATUS_BADGE: Record<string, string> = {
  mock_dispatched: "bg-zinc-700 text-zinc-400",
  dispatched: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  skipped: "bg-zinc-700 text-zinc-500",
};

function HandlerIcon({ name }: { name: string }) {
  const map: Record<string, string> = {
    crm_update: "CRM",
    service_delivery: "DEL",
    billing_trigger: "BIL",
    ready_to_action_notify: "NTF",
  };
  return (
    <span className="rounded bg-zinc-700 px-1 py-0.5 text-[9px] font-mono text-zinc-400">
      {map[name] ?? name.slice(0, 3).toUpperCase()}
    </span>
  );
}

function TaskRow({ task }: { task: WorkflowTask }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        {STATUS_ICON[task.status] ?? <Clock className="h-3 w-3 text-zinc-500" />}
        <HandlerIcon name={task.handler_name} />
        <span className="text-xs text-zinc-400 truncate max-w-[140px]">{task.event_type}</span>
        {task.mock && (
          <span className="text-[9px] text-zinc-600 border border-zinc-700 rounded px-1">mock</span>
        )}
      </div>
      <span
        className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${STATUS_BADGE[task.status] ?? "bg-zinc-700 text-zinc-400"}`}
      >
        {STATUS_LABEL[task.status] ?? task.status}
      </span>
    </div>
  );
}

export function WorkflowStatusPanel() {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [s, t] = await Promise.all([getWorkflowStatus(), getWorkflowTasks(undefined, 10)]);
      setStatus(s.data);
      setTasks(t.data);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-yellow-400" />
            Workflow Bus
          </h3>
          <p className="text-xs text-zinc-500">
            Automated tasks dispatched on business events
          </p>
        </div>
        {status && (
          <span className="text-xs text-zinc-400">
            {status.total_tasks} total
          </span>
        )}
      </div>

      {/* Stats */}
      {status && (
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: "Mock", value: status.mock_dispatched, color: "text-zinc-400" },
            { label: "Live", value: status.dispatched + status.completed, color: "text-blue-400" },
            { label: "Failed", value: status.failed, color: "text-red-400" },
            { label: "Pending", value: status.pending, color: "text-yellow-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-zinc-800 rounded-md text-center py-2">
              <div className={`text-sm font-semibold ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-zinc-600">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mock mode notice */}
      {status && status.mock_dispatched > 0 && status.dispatched === 0 && (
        <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-800/40 rounded-md px-3 py-2 border border-zinc-700/50">
          <Layers className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-400" />
          <span>
            All tasks are running in mock mode. Set{" "}
            <code className="text-zinc-300 font-mono text-[10px]">WORKFLOW_CRM_URL</code>,{" "}
            <code className="text-zinc-300 font-mono text-[10px]">WORKFLOW_DELIVERY_URL</code>, or{" "}
            <code className="text-zinc-300 font-mono text-[10px]">WORKFLOW_BILLING_URL</code>{" "}
            to activate live integrations.
          </span>
        </div>
      )}

      {/* Recent tasks */}
      {tasks.length > 0 ? (
        <div className="space-y-0">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Recent tasks</p>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-xs text-zinc-600">No tasks dispatched yet.</p>
          <p className="text-[10px] text-zinc-700 mt-1">
            Close an opportunity as WON to trigger the event bus.
          </p>
        </div>
      )}
    </div>
  );
}
