/**
 * Auth / organization / team / user types.
 *
 * Mirrors `apps/api/app/schemas/auth.py` and `apps/api/app/schemas/lead.py`.
 */

export type UserRole = "owner" | "admin" | "manager" | "member";

/** The 6 BEE chart tones a person can pick for their own avatar — same
 *  set as PickableColor in charts/palette.ts minus the 3 sales greens
 *  (those mean "closed/won" everywhere else, not "this is your color"). */
export type AvatarColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "chart-6";

export interface UserOut {
  id: string;
  organization_id: string;
  team_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  avatar_color: AvatarColor | null;
  phone: string | null;
  bio: string | null;
  timezone: string | null;
  created_at: string;
}

export interface UserProfileUpdateIn {
  full_name?: string;
  avatar_url?: string | null;
  avatar_color?: AvatarColor | null;
  phone?: string | null;
  bio?: string | null;
  timezone?: string | null;
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

export interface ForgotPasswordIn {
  email: string;
}

export interface ResetPasswordIn {
  token: string;
  new_password: string;
}

export interface TeamOut {
  id: string;
  organization_id: string;
  parent_team_id: string | null;
  name: string;
  description: string | null;
  /** ISO 4217 — what this team sells and is measured in. */
  currency: string;
}

export interface TeamCreateIn {
  name: string;
  description?: string | null;
  parent_team_id?: string | null;
  currency?: string;
}

export interface TeamProfileOut {
  id: string;
  team_id: string;
  signal_weights: Record<string, number>;
  research_focus: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamProfileIn {
  signal_weights: Record<string, number>;
  research_focus?: string | null;
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
