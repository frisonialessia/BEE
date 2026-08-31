"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  XCircle,
  Zap,
} from "lucide-react";

import { getWorkflowStatus, getWorkflowTasks } from "@/lib/api";
import type { WorkflowStatus, WorkflowTask } from "@/lib/types";

const STATUS_ICON: Record<string, React.ReactNode> = {
  mock_dispatched: <Layers className="size-3 stroke-[1.25] text-muted-foreground" />,
  dispatched: <Zap className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-4)" }} />,
  completed: <CheckCircle2 className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-5)" }} />,
  failed: <XCircle className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-2)" }} />,
  pending: <Clock className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-1)" }} />,
  skipped: <AlertTriangle className="size-3 stroke-[1.25] text-muted-foreground" />,
};

const STATUS_LABEL: Record<string, string> = {
  mock_dispatched: "Simulado",
  dispatched: "Despachado",
  completed: "Completado",
  failed: "Fallido",
  pending: "Pendiente",
  skipped: "Omitido",
};

function HandlerIcon({ name }: { name: string }) {
  const map: Record<string, string> = {
    crm_update: "CRM",
    service_delivery: "DEL",
    billing_trigger: "BIL",
    ready_to_action_notify: "NTF",
  };
  return (
    <span className="rounded-sm border border-border bg-background px-1 py-0.5 text-[11px] font-medium text-muted-foreground">
      {map[name] ?? name.slice(0, 3).toUpperCase()}
    </span>
  );
}

function TaskRow({ task }: { task: WorkflowTask }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        {STATUS_ICON[task.status] ?? (
          <Clock className="size-3 stroke-[1.25] text-muted-foreground" />
        )}
        <HandlerIcon name={task.handler_name} />
        <span className="max-w-[140px] truncate text-xs text-muted-foreground">
          {task.event_type}
        </span>
        {task.mock && (
          <span className="rounded-sm border border-border px-1 bee-micro">
            simulado
          </span>
        )}
      </div>
      <span className="bee-eyebrow text-[11px] normal-case tracking-normal">
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
      const [s, t] = await Promise.all([
        getWorkflowStatus(),
        getWorkflowTasks(undefined, 10),
      ]);
      setStatus(s.data);
      setTasks(t.data);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="bee-bento bee-bento-pad">
        <div className="h-4 w-32 animate-pulse rounded-sm bg-primary" />
      </div>
    );
  }

  return (
    <div className="bee-bento bee-bento-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 bee-card-title">
            <Zap className="size-4 stroke-[1.25]" style={{ color: "var(--color-chart-1)" }} />
            Bus de workflows
          </h3>
          <p className="bee-caption mt-0.5">
            Tareas automatizadas despachadas en eventos de negocio
          </p>
        </div>
        {status && (
          <span className="text-xs text-muted-foreground">{status.total_tasks} en total</span>
        )}
      </div>

      {status && (
        <div className="bee-stat-grid">
          {[
            { label: "Simulado", value: status.mock_dispatched },
            { label: "En vivo", value: status.dispatched + status.completed },
            { label: "Fallido", value: status.failed },
            { label: "Pendiente", value: status.pending },
          ].map((stat) => (
            <div key={stat.label} className="bee-stat">
              <div className="bee-stat__val">{stat.value}</div>
              <div className="bee-stat__lbl">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {status && status.mock_dispatched > 0 && status.dispatched === 0 && (
        <div className="flex items-start gap-2 border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          <Layers className="mt-0.5 size-3.5 shrink-0 stroke-[1.25]" />
          <span>
            Todas las tareas se ejecutan en modo simulado. Configura{" "}
            <code className="text-[11px] text-foreground">WORKFLOW_CRM_URL</code>,{" "}
            <code className="text-[11px] text-foreground">WORKFLOW_DELIVERY_URL</code> o{" "}
            <code className="text-[11px] text-foreground">WORKFLOW_BILLING_URL</code>{" "}
            para integraciones en vivo.
          </span>
        </div>
      )}

      {tasks.length > 0 ? (
        <div>
          <p className="bee-kpi-tile__label mb-2">Tareas recientes</p>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground">Aún no se han despachado tareas.</p>
          <p className="mt-1 bee-micro">
            Cierra una oportunidad como GANADA para activar el bus de eventos.
          </p>
        </div>
      )}
    </div>
  );
}
