"use client";

import { useMutation } from "@tanstack/react-query";

import { changePassword, forgotPassword, resetPassword } from "@/lib/api/auth";
import type { ForgotPasswordIn, ResetPasswordIn } from "@/types/auth";

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      changePassword(body),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordIn) => forgotPassword(body),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordIn) => resetPassword(body),
  });
}
