"use client";

/**
 * PendingActionsPanel — AgentOrchestrator approval queue.
 * No action executes without explicit CEO approval.
 */

import { useEffect, useState } from "react";
import { CheckCircle, Clock, Mail, ShieldCheck, XCircle } from "lucide-react";

import { approveAction, getPendingActions, rejectAction } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { PendingAction } from "@/lib/types";

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  send_email: <Mail className="size-4 stroke-[1.25]" />,
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendiente de aprobación",
  approved: "Aprobado",
  rejected: "Rechazado",
  executing: "Ejecutando",
  completed: "Completado",
  failed: "Fallido",
};

const STATUS_STYLES: Record<string, string> = {
  pending_approval: "bg-[color-mix(in_srgb,var(--color-chart-1)_25%,var(--color-background))]",
  approved: "bg-[color-mix(in_srgb,var(--color-chart-5)_20%,var(--color-background))]",
  rejected: "bg-[color-mix(in_srgb,var(--color-chart-2)_20%,var(--color-background))]",
  executing: "bg-[color-mix(in_srgb,var(--color-chart-4)_20%,var(--color-background))]",
  completed: "bg-primary",
  failed: "bg-[color-mix(in_srgb,var(--color-chart-2)_20%,var(--color-background))]",
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
  const statusLabel = STATUS_LABELS[action.status] ?? action.status.replace(/_/g, " ");

  return (
    <div className="bee-bento bee-bento--primary bee-bento-pad space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">
            {ACTION_TYPE_ICONS[action.action_type] ?? (
              <Clock className="size-4 stroke-[1.25]" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{action.title}</p>
            {action.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {action.description}
              </p>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLES[action.status] ?? "bg-background"}`}
        >
          {statusLabel}
        </span>
      </div>

      {action.preview && isPending && (
        <div className="whitespace-pre-wrap border border-border bg-background p-2.5 font-mono text-xs leading-relaxed text-muted-foreground line-clamp-4">
          {action.preview}
        </div>
      )}

      {action.retry_count > 0 && (
        <p className="text-xs" style={{ color: "var(--color-chart-2)" }}>
          Reintento #{action.retry_count}
        </p>
      )}

      {isPending && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={!!loading}
            className="bee-btn flex-1"
          >
            <CheckCircle className="size-3.5" />
            {loading === "approve" ? "Aprobando…" : "Aprobar"}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={!!loading}
            className="bee-btn flex-1 bg-background"
          >
            <XCircle className="size-3.5" />
            {loading === "reject" ? "Rechazando…" : "Rechazar"}
          </button>
        </div>
      )}

      {action.approved_by && (
        <p className="bee-micro">
          Aprobado por {action.approved_by}
          {action.approved_at &&
            ` · ${new Date(action.approved_at).toLocaleDateString()}`}
        </p>
      )}
    </div>
  );
}

export function PendingActionsPanel() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    getPendingActions(20).then((res) => {
      setActions(res.data);
      setLive(res.live);
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
    <div className="bee-bento bee-bento-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 bee-card-title">
            <ShieldCheck className="size-4 stroke-[1.25]" style={{ color: "var(--color-chart-5)" }} />
            Cola de ejecución
          </h3>
          <p className="bee-caption mt-0.5">
            Acciones en espera de aprobación antes de que BEE las ejecute externamente
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
          {pendingCount > 0 && (
            <span
              className="rounded-sm border border-border px-2 py-0.5 text-xs font-semibold"
              style={{
                background: "color-mix(in srgb, var(--color-chart-1) 25%, var(--color-background))",
              }}
            >
              {pendingCount} pendientes
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-sm" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <div className="py-6 text-center">
          <CheckCircle
            className="mx-auto mb-2 size-6 stroke-[1.25]"
            style={{ color: "var(--color-chart-5)" }}
          />
          <p className="text-xs text-muted-foreground">No hay acciones pendientes.</p>
          <p className="mt-1 bee-micro">
            Los artefactos de ejecución aparecerán aquí cuando BEE los genere.
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

      <p className="flex items-center gap-1.5 bee-micro">
        <span
          className="inline-block size-1.5"
          style={{ background: "var(--color-chart-1)" }}
        />
        Puerta de seguridad: ninguna acción se ejecuta sin la aprobación explícita del CEO.
      </p>
    </div>
  );
}
