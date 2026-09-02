"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Logo } from "@/components/logo";
import { useForgotPassword } from "@/hooks/queries/use-auth";

/**
 * ForgotPasswordPage — the self-serve entry point that didn't exist before
 * this feature: previously the only password recovery path was BEE's
 * internal, team-only emergency tool. This form always ends in the same
 * "check your email" message regardless of whether the address is
 * registered — mirrors the backend's anti-enumeration response on
 * POST /auth/forgot-password, so there's nothing here to distinguish.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Fire-and-treat-as-success even on a network/API error — matching the
    // backend's own posture. Surfacing a transport-error state here would
    // itself be a (small) enumeration/behavior signal, and it doesn't help
    // the visitor do anything differently.
    try {
      await forgotPassword.mutateAsync({ email });
    } finally {
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="bee-bento bee-bento-pad-lg">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-1 text-lg font-semibold">{t("title")}</h1>

          {submitted ? (
            <p className="bee-caption mt-4">{t("checkEmail")}</p>
          ) : (
            <>
              <p className="bee-caption mt-1">{t("subtitle")}</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="bee-caption block">
                    {t("emailLabel")}
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bee-input"
                    placeholder="tu@empresa.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotPassword.isPending}
                  className="bee-btn bee-btn--primary w-full"
                >
                  {forgotPassword.isPending ? t("submitting") : t("submit")}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="bee-caption mt-6 text-center">
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
