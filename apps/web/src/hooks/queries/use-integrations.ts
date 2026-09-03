"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  disconnectOAuthProvider,
  fetchIntegrations,
  getOAuthAuthorizeUrl,
  importFromHubSpot,
  importFromSalesforce,
  type OAuthProvider,
} from "@/lib/api/integrations";
import { queryKeys } from "@/lib/query-keys";

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations.list(),
    queryFn: fetchIntegrations,
  });
}

/** Navega la pestaña completa a la pantalla de consentimiento del
 * proveedor — es una redirección OAuth real, no un fetch, así que no hay
 * nada que invalidar hasta que el navegador regrese a
 * /dashboard/integrations?connected=<provider>. */
export function useConnectOAuthProvider(provider: OAuthProvider) {
  return useMutation({
    mutationFn: () => getOAuthAuthorizeUrl(provider),
    onSuccess: (authorizeUrl) => {
      window.location.href = authorizeUrl;
    },
  });
}

export function useDisconnectOAuthProvider(provider: OAuthProvider) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectOAuthProvider(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
    },
  });
}

export function useImportFromSalesforce() {
  return useMutation({
    mutationFn: importFromSalesforce,
  });
}

export function useImportFromHubSpot() {
  return useMutation({
    mutationFn: importFromHubSpot,
  });
}
