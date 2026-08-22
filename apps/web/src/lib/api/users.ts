import { apiFetch } from "@/lib/api/client";
import type { UserCreateIn, UserOut, UserUpdateIn } from "@/types/auth";

export async function fetchUsers(): Promise<UserOut[]> {
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
