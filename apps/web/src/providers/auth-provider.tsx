"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
  register: (body: OrganizationRegisterIn) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

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

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: user !== null, login, register, logout }}
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
