"use client";

import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Error boundary for the /dashboard segment — renders inside the shell
 * (rail + header stay put) so a broken page never takes the whole app
 * down. Same copy and controls as the root error.tsx, in the page's own
 * card style; the technical message goes to the console/Sentry, not to
 * the person.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorPages.error");

  useEffect(() => {
    console.error("Dashboard error:", error);
    // No-op when NEXT_PUBLIC_SENTRY_DSN isn't set (see instrumentation-client.ts).
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="bee-bento bee-bento-pad-lg mx-auto mt-8 max-w-md text-center">
      <p className="bee-eyebrow">{t("eyebrow")}</p>
      <h2 className="mt-1 text-lg font-semibold">{t("title")}</h2>
      <p className="bee-caption mt-2">{t("subtitle")}</p>
      <button type="button" onClick={reset} className="bee-btn bee-btn--primary mt-6">
        {t("retry")}
      </button>
    </div>
  );
}
