"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { PAGE_SIZE_OPTIONS } from "@/hooks/use-pagination";

interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel?: string;
}

/** Paginador numérico clásico + selector de densidad. */
export function PaginationBar({
  page,
  pageSize,
  totalPages,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}: PaginationBarProps) {
  const t = useTranslations("dashboardOverview.pagination");

  if (totalItems === 0) return null;

  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="bee-pagination">
      <p className="bee-caption">
        {t("summary", {
          count: totalItems,
          label: itemLabel ?? t("defaultItemLabel"),
          page,
          totalPages,
        })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("density")}
          <select
            className="bee-pagination__select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label={t("itemsPerPage")}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t("perPageOption", { count: n })}
              </option>
            ))}
          </select>
        </label>

        <div className="bee-pagination__pages" role="navigation" aria-label={t("navigation")}>
          <button
            type="button"
            className="bee-pagination__btn"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t("previousPage")}
          >
            <ChevronLeft className="size-4" />
          </button>

          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`bee-pagination__btn ${p === page ? "bee-pagination__btn--active" : ""}`}
                onClick={() => onPageChange(p as number)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            className="bee-pagination__btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t("nextPage")}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}
