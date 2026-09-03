"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { createQueryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { PostHogProvider } from "@/providers/posthog-provider";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Inside AuthProvider, not outside — PostHogIdentify calls
             useAuth() to identify/reset the PostHog user on login/logout. */}
          <PostHogProvider>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </PostHogProvider>
        </AuthProvider>
        {process.env.NODE_ENV === "development" ? (
          // bottom-right, not bottom-left — the dashboard rail's own icons
          // (Equipo, Cerrar sesión) live in that bottom-left corner.
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
