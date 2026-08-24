"use client";

import { Bookmark, ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useCreateSavedView, useDeleteSavedView, useSavedViews } from "@/hooks/queries/use-saved-views";
import { cn } from "@/lib/utils";

/** Vistas guardadas — un nombre para una combinación de filtro/orden que ya
 *  armaste, para no rehacerla cada vez. Genérico por diseño: cada página
 *  (Leads, y eventualmente Oportunidades/Empresas) define su propia forma
 *  de `config` y solo la pasa/recibe aquí — el backend nunca la interpreta,
 *  así que una página nueva la adopta sin ningún cambio de servidor. */
export function SavedViewsControl<TConfig extends Record<string, unknown>>({
  page,
  currentConfig,
  onApply,
}: {
  page: string;
  currentConfig: TConfig;
  onApply: (config: TConfig) => void;
}) {
  const { data: result } = useSavedViews(page);
  const createView = useCreateSavedView();
  const deleteView = useDeleteSavedView(page);

  const [open, setOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const views = result?.data ?? [];

  function saveCurrent() {
    if (name.trim() === "") return;
    createView.mutate(
      { name: name.trim(), page, config: currentConfig, is_shared: shared },
      {
        onSuccess: () => {
          setName("");
          setShared(false);
          setShowSaveForm(false);
        },
      },
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-[var(--color-card)] px-3 py-1.5 text-xs outline-none"
      >
        <Bookmark className="size-3.5" />
        Vistas guardadas
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="bee-glass absolute right-0 top-full z-20 mt-1.5 w-72 rounded-[var(--radius-lg)] p-2">
          {views.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">Todavía no hay vistas guardadas.</p>
          ) : (
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {views.map((v) => (
                <div
                  key={v.id}
                  className="group flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--color-primary)]/25"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApply(v.config as TConfig);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-xs"
                  >
                    {v.name}
                    {v.is_shared && <span className="ml-1.5 text-[10px] text-muted-foreground">· equipo</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteView.mutate(v.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Eliminar vista"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 border-t border-border pt-2">
            {showSaveForm ? (
              <div className="space-y-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
                  placeholder="Nombre de la vista…"
                  autoFocus
                  className="w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(e) => setShared(e.target.checked)}
                    className="size-3 accent-[var(--color-chart-4)]"
                  />
                  Compartir con el equipo
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={saveCurrent}
                    disabled={name.trim() === "" || createView.isPending}
                    className="bee-btn bee-btn--primary flex-1 text-[11px]"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveForm(false)}
                    className="bee-btn-ghost text-[11px]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveForm(true)}
                className="w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs text-[var(--color-chart-4)] hover:bg-[var(--color-primary)]/25"
              >
                + Guardar vista actual
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
