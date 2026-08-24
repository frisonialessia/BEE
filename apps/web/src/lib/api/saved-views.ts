import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";

export interface SavedView {
  id: string;
  name: string;
  page: string;
  config: Record<string, unknown>;
  is_shared: boolean;
  created_by_user_id: string | null;
  created_at: string;
}

export interface SavedViewCreateIn {
  name: string;
  page: string;
  config: Record<string, unknown>;
  is_shared?: boolean;
}

export async function fetchSavedViews(page: string): Promise<FetchResult<SavedView[]>> {
  try {
    const data = await apiFetch<SavedView[]>(
      `/api/v1/saved-views?page=${encodeURIComponent(page)}`,
      { cache: "no-store" },
    );
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function createSavedView(body: SavedViewCreateIn): Promise<SavedView> {
  return apiFetch<SavedView>("/api/v1/saved-views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteSavedView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/saved-views/${id}`, { method: "DELETE" });
}
