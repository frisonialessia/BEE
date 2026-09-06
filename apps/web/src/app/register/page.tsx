"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { Logo } from "@/components/logo";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  // Prefilled from the homepage's own hero form (`?email=`, a plain GET
  // submit — see app/page.tsx) so typing it there isn't wasted.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signupClosed, setSignupClosed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({
        organization_name: organizationName,
        full_name: fullName,
        email,
        password,
        invite_code: inviteCode || undefined,
      });
      router.push("/dashboard");
    } catch (err) {
      // 403 here is specifically SIGNUP_INVITE_CODE rejecting them (see
      // app/api/v1/endpoints/auth.py's register()). Until email
      // verification exists that gate is what keeps a stranger from
      // claiming another company's domain, so the honest answer is not
      // "invalid invite code" — it is "we are not open, here is the list".
      if (err instanceof ApiError && err.status === 403) {
        setSignupClosed(true);
      } else {
        setError(err instanceof ApiError ? err.message : t("genericError"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        {/* The wordmark is the way back out. Someone who lands on a login
            or signup form and decides they want to read about the product
            first reaches for the logo — every other site trains them to.
            Without this it was inert and the only way back to the landing
            was the browser's back button. */}
        <div className="mb-4 flex justify-center">
          <Link href="/" aria-label="BEE" className="rounded-lg transition-opacity hover:opacity-80">
            <Logo />
          </Link>
        </div>

        {signupClosed && (
          <div className="bee-bento bee-bento-pad mb-4">
            <h1 className="text-lg font-semibold">{t("closedTitle")}</h1>
            <p className="bee-caption mt-2">{t("closedBody")}</p>
            <Link
              href="/#waitlist"
              className="bee-btn bee-btn--primary bee-cta-lift mt-4 w-full justify-center"
            >
              {t("waitlistLink")}
            </Link>
          </div>
        )}

        <div className="bee-bento bee-bento-pad">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-1 text-lg font-semibold">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="organizationName" className="bee-caption block">
                {t("orgNameLabel")}
              </label>
              <input
                id="organizationName"
                required
                minLength={2}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="bee-input"
                placeholder={t("orgNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="fullName" className="bee-caption block">
                {t("fullNameLabel")}
              </label>
              <input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bee-input"
                placeholder={t("fullNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
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
                placeholder={t("emailPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="bee-caption block">
                {t("passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bee-input"
                placeholder={t("passwordHint")}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="inviteCode" className="bee-caption block">
                {t("inviteCodeLabel")} <span className="text-muted-foreground">{t("inviteCodeOptionalNote")}</span>
              </label>
              <input
                id="inviteCode"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="bee-input"
                placeholder={t("inviteCodePlaceholder")}
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--color-text)]" role="alert">
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

        <p className="bee-caption mt-4 text-center">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
