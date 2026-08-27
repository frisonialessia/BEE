"use client";

import { useMutation } from "@tanstack/react-query";

import { changePassword } from "@/lib/api/auth";

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      changePassword(body),
  });
}
