"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Logo } from "@/components/logo";

/**
 * Root error.tsx — catches a render error in any route segment outside
 * /dashboard (which has its own, narrower error.tsx). Must be a Client
 * Component (Next.js requirement for error boundaries), which is fine
 * here: it renders below the root layout, so NextIntlClientProvider's
 * context is still available — unlike global-error.tsx, which replaces
 * the root layout itself and can't rely on it.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorPages.error");

  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="bee-bento bee-bento-pad-lg">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-1 text-lg font-semibold">{t("title")}</h1>
          <p className="bee-caption mt-2">{t("subtitle")}</p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={reset} className="bee-btn bee-btn--primary">
              {t("retry")}
            </button>
            <Link href="/" className="bee-btn-ghost">
              {t("backHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
