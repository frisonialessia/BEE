/**
 * Auth / organization / team / user types.
 *
 * Mirrors `apps/api/app/schemas/auth.py` and `apps/api/app/schemas/lead.py`.
 */

export type UserRole = "owner" | "admin" | "manager" | "member";

export interface UserOut {
  id: string;
  organization_id: string;
  team_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  created_at: string;
}

export interface UserProfileUpdateIn {
  full_name?: string;
  avatar_url?: string | null;
  phone?: string | null;
  bio?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

export interface OrganizationRegisterIn {
  organization_name: string;
  full_name: string;
  email: string;
  password: string;
  // Only required when the backend deployment has SIGNUP_INVITE_CODE set
  // (a controlled-beta gate) — omit/leave blank otherwise.
  invite_code?: string;
}

export interface UserLoginIn {
  email: string;
  password: string;
}

export interface TeamOut {
  id: string;
  organization_id: string;
  parent_team_id: string | null;
  name: string;
  description: string | null;
}

export interface TeamCreateIn {
  name: string;
  description?: string | null;
  parent_team_id?: string | null;
}

export interface UserCreateIn {
  email: string;
  password: string;
  full_name: string;
  role?: UserRole;
  team_id?: string | null;
}

export interface UserUpdateIn {
  role?: UserRole;
  team_id?: string | null;
  is_active?: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Miembro",
};
