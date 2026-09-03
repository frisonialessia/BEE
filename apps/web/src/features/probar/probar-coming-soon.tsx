"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shown for every Dashboard section not yet simulated in `/probar` (see
 * `PROBAR_LIVE_SECTIONS` in `app/probar/nav-items.ts`). Says so plainly
 * instead of faking data for it — this product's honesty policy applies to
 * the sandbox too: "not built here yet" stays visibly that, never dressed
 * up as a working demo. */
export function ProbarComingSoon({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  const t = useTranslations("workspace.sequences.comingSoon");

  return (
    <div className="bee-bento bee-bento-pad flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
        <Icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
      </div>
      <div>
        <h2 className="text-base font-semibold">{t("title", { label })}</h2>
        <p className="bee-caption mt-1 max-w-md">{t("description")}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link href="/register" className="bee-btn bee-btn--primary">
          {t("createAccount")}
        </Link>
        <Link href="/probar/signals" className="bee-btn-ghost">
          {t("backToSignals")}
        </Link>
      </div>
    </div>
  );
}
