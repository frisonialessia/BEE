import { apiFetch } from "@/lib/api/client";
import { demoFetchUsers } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/demo/mode";
import type { UserCreateIn, UserOut, UserProfileUpdateIn, UserUpdateIn } from "@/types/auth";

/** A small fixed demo team (see demoFetchUsers) — explicit override of the
 * original "no demo team, sandbox has no login" default, same precedent as
 * Control/Red/Voz de marca/Resiliencia's own local stores (see
 * PROBAR_LIVE_SECTIONS' docstring). A Leaderboard or a shared Calendario
 * with zero teammates isn't a smaller honest version of either feature. */
export async function fetchUsers(): Promise<UserOut[]> {
  if (isDemoMode()) return demoFetchUsers();
  return apiFetch<UserOut[]>("/api/v1/users", { cache: "no-store" });
}

export async function createUser(body: UserCreateIn): Promise<UserOut> {
  return apiFetch<UserOut>("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateUser(userId: string, body: UserUpdateIn): Promise<UserOut> {
  return apiFetch<UserOut>(`/api/v1/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/users/${userId}`, { method: "DELETE" });
}

/** Self-service — the logged-in user editing their own name/avatar/phone/bio.
 * Distinct from updateUser (OWNER/ADMIN changing a teammate's role/team). */
export async function updateMyProfile(body: UserProfileUpdateIn): Promise<UserOut> {
  return apiFetch<UserOut>("/api/v1/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Self-service account deletion. The backend rejects this for an OWNER
 * (ownership transfer isn't implemented yet) with a 403 the caller should
 * surface as-is — see DELETE /users/me's docstring. */
export async function deleteMyAccount(): Promise<void> {
  return apiFetch<void>("/api/v1/users/me", { method: "DELETE" });
}
