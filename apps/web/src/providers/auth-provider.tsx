"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { fetchMe, login as apiLogin, registerOrganization } from "@/lib/api/auth";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth-storage";
import type { OrganizationRegisterIn, UserLoginIn, UserOut } from "@/types/auth";

interface AuthContextValue {
  /** null while the initial session check is in flight. */
  user: UserOut | null;
  /** True only during the very first mount, while we validate a stored token. */
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (body: UserLoginIn) => Promise<void>;
  /** Completes an SSO login — see src/app/login/page.tsx, which reads the
   * `#sso_token=...` fragment GET /auth/sso/callback redirects back with
   * (see apps/api's app.api.v1.endpoints.sso) and hands it here rather
   * than duplicating the store-token-then-fetch-/me sequence login()
   * already does. */
  loginWithToken: (token: string) => Promise<void>;
  register: (body: OrganizationRegisterIn) => Promise<void>;
  logout: () => void;
  /** Apply a fresh UserOut returned by a mutation (e.g. PATCH /users/me)
   * without a round trip to /auth/me — the caller already has the current
   * server state, no need to re-fetch it. */
  setUser: (user: UserOut) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      // One-time mount check, not a state->effect->state loop — there's no
      // cascading render risk here, just the initial "am I logged in?" gate.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }
    // Validate the stored token against the API rather than trusting it
    // blindly — it may have expired or the user may have been deactivated
    // since the last visit.
    fetchMe()
      .then(setUser)
      .catch(() => {
        clearStoredToken();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (body: UserLoginIn) => {
    const result = await apiLogin(body);
    setStoredToken(result.access_token);
    setUser(result.user);
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    // The callback already validated this token server-side (it's the
    // exact JWT create_access_token issued after matching the SSO
    // profile to an existing user) — still round-trips through /auth/me
    // rather than trusting it blindly, same reasoning as the mount-time
    // check above.
    setStoredToken(token);
    const me = await fetchMe();
    setUser(me);
  }, []);

  const register = useCallback(async (body: OrganizationRegisterIn) => {
    const result = await registerOrganization(body);
    setStoredToken(result.access_token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setUser(null);
    // Every cached query may hold data scoped to the previous session — drop
    // it all so the next login never flashes stale, cross-user data.
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    // apiFetch (lib/api/client.ts) broadcasts this the moment any request
    // comes back 401 while a session token was actually attached — an
    // expired token, or a deactivated user. Without this, every individual
    // fetch* caller just caught the resulting ApiError and quietly
    // degraded (empty list, stale cached demo data) — nothing ever told
    // the person their session died; the dashboard just silently stopped
    // updating. One listener here reacts uniformly instead of every caller
    // reinventing the check.
    function handleSessionExpired() {
      logout();
      toast.error("Tu sesión expiró — inicia sesión de nuevo.");
      router.replace("/login");
    }
    window.addEventListener("bee:session-expired", handleSessionExpired);
    return () => window.removeEventListener("bee:session-expired", handleSessionExpired);
  }, [logout, router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        loginWithToken,
        register,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
