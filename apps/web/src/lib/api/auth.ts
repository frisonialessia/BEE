import { apiFetch } from "@/lib/api/client";
import type {
  ForgotPasswordIn,
  OrganizationRegisterIn,
  ResetPasswordIn,
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

/** Always resolves — the backend returns the same generic 200 whether or
 * not the email is registered (anti-enumeration), so there's no "not
 * found" case for a caller here to handle. */
export async function forgotPassword(body: ForgotPasswordIn): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>("/api/v1/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function resetPassword(body: ResetPasswordIn): Promise<void> {
  return apiFetch<void>("/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
