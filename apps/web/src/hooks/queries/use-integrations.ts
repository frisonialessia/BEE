"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { disconnectGmail, fetchIntegrations, getGmailAuthorizeUrl } from "@/lib/api/integrations";
import { queryKeys } from "@/lib/query-keys";

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations.list(),
    queryFn: fetchIntegrations,
  });
}

/** Navigates the whole tab to Google's consent screen — this is a real
 * OAuth redirect, not a fetch, so there's nothing to invalidate until the
 * browser comes back to /dashboard/integrations?connected=gmail. */
export function useConnectGmail() {
  return useMutation({
    mutationFn: getGmailAuthorizeUrl,
    onSuccess: (authorizeUrl) => {
      window.location.href = authorizeUrl;
    },
  });
}

export function useDisconnectGmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectGmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
    },
  });
}
