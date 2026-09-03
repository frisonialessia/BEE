"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

/** GET /auth/sso/callback (apps/api's app.api.v1.endpoints.sso) redirects
 * back here with either `#sso_token=<jwt>` on success or `?sso_error=...`
 * on failure — see that endpoint's own docstring for why the token rides
 * in the URL fragment (never sent to a server, never logged) rather than
 * a query param. */
const SSO_ERROR_MESSAGE_KEY: Record<string, string> = {
  exchange_failed: "ssoErrorExchangeFailed",
  unknown_connection: "ssoErrorUnknownConnection",
  no_account: "ssoErrorNoAccount",
};

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSsoCompleting, setIsSsoCompleting] = useState(false);

  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    if (ssoError) {
      // One-time mount check of the URL this page loaded with, not a
      // state->effect->state loop — same reasoning as AuthProvider's own
      // mount-time setIsLoading(false).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(t(SSO_ERROR_MESSAGE_KEY[ssoError] ?? "ssoErrorGeneric"));
      return;
    }

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const match = /(?:^#|&)sso_token=([^&]+)/.exec(hash);
    if (!match) return;

    const token = decodeURIComponent(match[1]);
    // Strip the token from the URL immediately — it's a live session
    // credential and shouldn't linger in history/back-forward cache.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setIsSsoCompleting(true);
    loginWithToken(token)
      .then(() => router.push("/dashboard"))
      .catch(() => {
        setIsSsoCompleting(false);
        setError(t("ssoErrorGeneric"));
      });
    // Runs once off the URL this page mounted with — loginWithToken/router
    // are stable callbacks, re-running this on their identity is not the
    // intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setIsSubmitting(false);
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

          {isSsoCompleting && (
            <p className="mt-6 text-sm text-muted-foreground" role="status">
              {t("ssoSigningIn")}
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            className={isSsoCompleting ? "hidden" : "mt-6 space-y-4"}
          >
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="bee-caption block">
                  {t("passwordLabel")}
                </label>
                <Link href="/forgot-password" className="bee-caption text-foreground underline underline-offset-4">
                  {t("forgotPassword")}
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bee-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--color-chart-2)]" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="bee-btn bee-btn--primary w-full"
            >
              {isSubmitting ? t("submitting") : t("submit")}
            </button>
          </form>
        </div>

        <p className="bee-caption mt-6 text-center">
          {t("noOrgYet")}{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            {t("createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
