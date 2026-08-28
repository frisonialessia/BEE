"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchOrganizationProfile,
  updateOrganizationProfile,
  type OrganizationProfileIn,
} from "@/lib/api/organizations";
import { queryKeys } from "@/lib/query-keys";

export function useOrganizationProfile() {
  return useQuery({
    queryKey: queryKeys.organizationProfile.detail(),
    queryFn: async () => fetchOrganizationProfile(),
  });
}

export function useUpdateOrganizationProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationProfileIn) => updateOrganizationProfile(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizationProfile.all });
    },
  });
}
