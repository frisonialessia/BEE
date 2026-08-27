import { apiFetch } from "@/lib/api/client";
import type {
  OrganizationRegisterIn,
  TokenResponse,
  UserLoginIn,
  UserOut,
} from "@/types/auth";

export async function registerOrganization(body: OrganizationRegisterIn): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function login(body: UserLoginIn): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchMe(): Promise<UserOut> {
  return apiFetch<UserOut>("/api/v1/auth/me", { cache: "no-store" });
}

export async function changePassword(body: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  return apiFetch<void>("/api/v1/auth/me/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
