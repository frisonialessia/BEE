"use client";

import { useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [12, 24, 36, 48] as const;
export const DEFAULT_PAGE_SIZE = 12;

export function usePagination<T>(items: T[], initialPageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  function goToPage(next: number) {
    setPage(Math.max(1, Math.min(totalPages, next)));
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems: items.length,
    pageItems,
    goToPage,
    changePageSize,
    setPage: goToPage,
  };
}
