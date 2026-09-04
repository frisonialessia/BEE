"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkflowStatus, WorkflowTask } from "@/lib/types";
import { LiveBadge } from "@/components/live-badge";
import { KpiStrip } from "@/components/metric-card";

const STATUS_ICON: Record<string, React.ReactNode> = {
  mock_dispatched: <Layers className="size-3 stroke-[1.25] text-muted-foreground" />,
  dispatched: <Zap className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-4)" }} />,
  completed: <CheckCircle2 className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-5)" }} />,
  failed: <XCircle className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-2)" }} />,
  pending: <Clock className="size-3 stroke-[1.25]" style={{ color: "var(--color-chart-1)" }} />,
  skipped: <AlertTriangle className="size-3 stroke-[1.25] text-muted-foreground" />,
};

function HandlerIcon({ name }: { name: string }) {
  const map: Record<string, string> = {
    crm_update: "CRM",
    service_delivery: "DEL",
    billing_trigger: "BIL",
    ready_to_action_notify: "NTF",
  };
  return (
    <span className="rounded-sm border border-border bg-background px-1 py-1 text-micro font-medium text-muted-foreground">
      {map[name] ?? name.slice(0, 3).toUpperCase()}
    </span>
  );
}

function TaskRow({ task }: { task: WorkflowTask }) {
  const t = useTranslations("workspace.sequences.workflowStatus");
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
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
            {t("taskSimulatedTag")}
          </span>
        )}
      </div>
      <span className="bee-eyebrow text-micro normal-case tracking-normal">
        {t.has(`statusLabels.${task.status}`) ? t(`statusLabels.${task.status}`) : task.status}
      </span>
    </div>
  );
}

export function WorkflowStatusPanel() {
  const t = useTranslations("workspace.sequences.workflowStatus");
  const pathname = usePathname();
  const connectionsHref = pathname?.startsWith("/probar") ? "/probar/control?tab=connections" : "/dashboard/control?tab=connections";
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    async function load() {
      const [s, t] = await Promise.all([
        getWorkflowStatus(),
        getWorkflowTasks(undefined, 10),
      ]);
      setStatus(s.data);
      setTasks(t.data);
      setLive(s.live || t.live);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <OverviewCard span={6} title={t("title")} caption={t("subtitle")}>
        <Skeleton className="h-20 w-full" />
      </OverviewCard>
    );
  }

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("subtitle")}
      action={
        <div className="flex shrink-0 items-center gap-2">
          <LiveBadge live={live} />
          {status && (
            <span className="text-xs text-muted-foreground">
              {status.total_tasks} {t("totalSuffix")}
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {status && (
          <KpiStrip
            cols={4}
            items={[
              { label: t("stats.mock"), value: status.mock_dispatched },
              { label: t("stats.live"), value: status.dispatched + status.completed },
              { label: t("stats.failed"), value: status.failed },
              { label: t("stats.pending"), value: status.pending },
            ]}
          />
        )}

        {status && status.mock_dispatched > 0 && status.dispatched === 0 && (
          <div className="flex items-start gap-2 border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            <Layers className="mt-1 size-3.5 shrink-0 stroke-[1.25]" />
            <span>
              {t("mockNoticePrefix")}{" "}
              <Link href={connectionsHref} className="font-medium text-foreground underline underline-offset-2">
                {t("mockNoticeHighlight")}
              </Link>{" "}
              {t("mockNoticeSuffix")}
            </span>
          </div>
        )}

        {tasks.length > 0 ? (
          <div>
            <p className="bee-micro mb-2">{t("recentTasks")}</p>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">{t("empty.title")}</p>
            <p className="mt-1 bee-micro">{t("empty.subtitle")}</p>
          </div>
        )}
      </div>
    </OverviewCard>
  );
}
