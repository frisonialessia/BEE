import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";

/**
 * Root not-found.tsx — the catch-all for any unmatched route (and any
 * nested `notFound()` call not caught by a more specific boundary; the
 * dashboard segment doesn't define its own). Before this existed, a 404
 * anywhere outside /dashboard fell through to Next.js's generic unbranded
 * page.
 */
export default async function NotFound() {
  const t = await getTranslations("common.errorPages.notFound");

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
            <Link href="/" className="bee-btn bee-btn--primary">
              {t("backHome")}
            </Link>
            <Link href="/dashboard" className="bee-btn-ghost">
              {t("goToDashboard")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
