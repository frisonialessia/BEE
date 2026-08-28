"use client";

import { SignalCard } from "@/components/signal-card";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { useSignals } from "@/hooks/queries/use-signals";

/** Panel de señales — triggers de mercado del Signal Engine. */
export function SignalsDashboard() {
  const { data: result, isLoading, isError } = useSignals(200);

  const signals = result?.data ?? [];
  const live = result?.live ?? false;
  const hotCount = signals.filter((s) => s.score >= 75).length;
  const pagination = usePagination(signals);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Motor de señales</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Señales</h1>
            <p className="bee-caption mt-1">
              Triggers de mercado — funding, contrataciones, adopción tecnológica y más
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>
            {live ? "En vivo" : "Datos demo"}
          </Badge>
        </div>

        <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
          <span>{signals.length} total</span>
          <span>{hotCount} alta intención (≥75)</span>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Error al cargar señales.</p>
      ) : signals.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <p className="text-sm text-muted-foreground">Aún no hay señales.</p>
          <p className="bee-caption mt-2">
            POST a{" "}
            <code className="border border-border bg-background px-1.5 py-0.5 font-mono text-xs">
              /api/v1/signals/webhook
            </code>{" "}
            para ingerir.
          </p>
        </div>
      ) : (
        <>
          {/* Columna apilada en mobile a propósito, no el patrón de caja
           * con scroll horizontal que usa el Pipeline (crm-board.tsx) o
           * las tarjetas cortas de /probar — cada SignalCard trae título +
           * descripción + tags, texto largo que se lee peor recortado en
           * una tarjeta angosta de scroll horizontal que apilado a lo
           * ancho de la pantalla. */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pagination.pageItems.map((signal, i) => (
              <SignalCard key={signal.id} signal={signal} toneIndex={i} />
            ))}
          </div>

          <PaginationBar
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            onPageChange={pagination.goToPage}
            onPageSizeChange={pagination.changePageSize}
            itemLabel="señales"
          />
        </>
      )}
    </div>
  );
}
