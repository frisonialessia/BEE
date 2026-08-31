"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useCreateTask, useDeleteTask, useOpportunityTasks, useUpdateTask } from "@/hooks/queries/use-tasks";
import { cn } from "@/lib/utils";
import type { OpportunityTask } from "@/types/domain";

function isOverdue(task: OpportunityTask): boolean {
  return !task.completed_at && task.due_at !== null && new Date(task.due_at) < new Date();
}

function TaskRow({
  task,
  toggling,
  onToggle,
  onDelete,
}: {
  task: OpportunityTask;
  toggling: boolean;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div className="group flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--color-primary)]/20">
      <input
        type="checkbox"
        checked={Boolean(task.completed_at)}
        disabled={toggling}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-chart-4)] disabled:opacity-50"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-xs", task.completed_at ? "text-muted-foreground line-through" : "text-foreground")}>
          {task.title}
        </p>
        {task.due_at && (
          <p className={cn("text-[11px]", overdue ? "text-destructive" : "text-muted-foreground")}>
            {new Date(task.due_at).toLocaleDateString()} {overdue && "· vencida"}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label="Eliminar tarea"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

/** Tareas de seguimiento — un to-do ligero por oportunidad ("llamar el
 *  jueves", "mandar la propuesta después de la demo"). BEE ya sugiere el
 *  siguiente paso vía `strategy.next_best_action`, pero eso se regenera
 *  solo — esto es lo que el rep se recuerda a sí mismo y marca como hecho. */
export function TaskListPanel({ opportunityId }: { opportunityId: string }) {
  const { data: result, isLoading } = useOpportunityTasks(opportunityId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(opportunityId);
  const deleteTask = useDeleteTask(opportunityId);

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  const tasks = result?.data ?? [];
  const open = tasks.filter((t) => !t.completed_at);
  const completed = tasks.filter((t) => t.completed_at);

  function submit() {
    if (title.trim() === "") return;
    createTask.mutate(
      {
        opportunity_id: opportunityId,
        title: title.trim(),
        due_at: dueAt.trim() === "" ? undefined : new Date(dueAt).toISOString(),
      },
      {
        onSuccess: () => {
          setTitle("");
          setDueAt("");
        },
      },
    );
  }

  return (
    <section className="bee-surface bee-bento-pad">
      <h3 className="bee-card-title">Tareas de seguimiento</h3>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-0.5">
          {open.length === 0 && completed.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">Sin tareas todavía.</p>
          )}
          {open.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              toggling={updateTask.isPending && updateTask.variables?.id === task.id}
              onToggle={(completed) => updateTask.mutate({ id: task.id, body: { completed } })}
              onDelete={() => deleteTask.mutate(task.id)}
            />
          ))}
          {completed.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer bee-micro">
                {completed.length} completada{completed.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-1 space-y-0.5">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    toggling={updateTask.isPending && updateTask.variables?.id === task.id}
                    onToggle={(completed) => updateTask.mutate({ id: task.id, body: { completed } })}
                    onDelete={() => deleteTask.mutate(task.id)}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Nueva tarea…"
          className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-32 shrink-0 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={title.trim() === "" || createTask.isPending}
          className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-chart-4)] p-1.5 text-background disabled:opacity-50"
          aria-label="Agregar tarea"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </section>
  );
}
