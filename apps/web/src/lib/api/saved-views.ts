import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
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
  // The sandbox has no session — hitting the real API from /probar only
  // produced a 401 in the console on every Leads visit.
  if (isDemoMode()) return { data: [], live: false };
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
  if (isDemoMode()) throw new Error("Las vistas guardadas no persisten en el sandbox.");
  return apiFetch<SavedView>("/api/v1/saved-views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteSavedView(id: string): Promise<void> {
  if (isDemoMode()) throw new Error("Las vistas guardadas no persisten en el sandbox.");
  await apiFetch<void>(`/api/v1/saved-views/${id}`, { method: "DELETE" });
}
