"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchIcpCriteria, updateIcpCriteria, type IcpCriteria } from "@/lib/api/organizations";
import { queryKeys } from "@/lib/query-keys";

export function useIcpCriteria() {
  return useQuery({
    queryKey: queryKeys.icp.criteria(),
    queryFn: async () => fetchIcpCriteria(),
  });
}

export function useUpdateIcpCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: IcpCriteria) => updateIcpCriteria(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.icp.all });
    },
  });
}
