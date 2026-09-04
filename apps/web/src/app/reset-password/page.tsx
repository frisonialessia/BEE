"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { Logo } from "@/components/logo";
import { useResetPassword } from "@/hooks/queries/use-auth";
import { ApiError } from "@/types/api";

/**
 * ResetPasswordPage — where the link from POST /auth/forgot-password's
 * email lands (?token=...). Wrapped in Suspense because useSearchParams()
 * needs it in the App Router, same reason marketing pages that read query
 * params do the same.
 */
function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const resetPassword = useResetPassword();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("mismatchError"));
      return;
    }
    if (!token) {
      setError(t("missingTokenError"));
      return;
    }

    try {
      await resetPassword.mutateAsync({ token, new_password: newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>

        <div className="bee-bento bee-bento-pad">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-1 text-lg font-semibold">{t("title")}</h1>

          {!token ? (
            <p className="bee-caption mt-4">{t("missingTokenError")}</p>
          ) : done ? (
            <>
              <p className="bee-caption mt-4">{t("success")}</p>
              <button
                onClick={() => router.push("/login")}
                className="bee-btn bee-btn--primary mt-4 w-full"
              >
                {t("goToLogin")}
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="newPassword" className="bee-caption block">
                  {t("newPasswordLabel")}
                </label>
                <input
                  id="newPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bee-input"
                  placeholder={t("passwordHint")}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="bee-caption block">
                  {t("confirmPasswordLabel")}
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bee-input"
                  placeholder={t("passwordHint")}
                />
              </div>

              {error && (
                <p className="text-xs text-[var(--color-text)]" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={resetPassword.isPending}
                className="bee-btn bee-btn--primary w-full"
              >
                {resetPassword.isPending ? t("submitting") : t("submit")}
              </button>
            </form>
          )}
        </div>

        <p className="bee-caption mt-4 text-center">
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
