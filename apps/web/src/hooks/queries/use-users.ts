"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createUser,
  deleteMyAccount,
  deleteUser,
  fetchUsers,
  updateMyProfile,
  updateUser,
} from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";
import type { UserCreateIn, UserProfileUpdateIn, UserUpdateIn } from "@/types/auth";

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: fetchUsers,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreateIn) => createUser(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UserUpdateIn }) =>
      updateUser(userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

/** Self-service — see updateMyProfile's docstring. Caller is responsible
 * for updating any local copy of the logged-in user (e.g. AuthProvider)
 * with the returned UserOut; this hook only owns the request itself. */
export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserProfileUpdateIn) => updateMyProfile(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

/** Self-service account deletion — see deleteMyAccount's docstring on the
 * OWNER 403 case. Doesn't touch auth state itself (no stored token to
 * clear, no redirect) — the caller does that on success, same division of
 * responsibility as useUpdateMyProfile above. */
export function useDeleteMyAccount() {
  return useMutation({
    mutationFn: () => deleteMyAccount(),
  });
}
