"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";

import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * Global language switcher — Español / English. Two tiny buttons rather
 * than a dropdown: there are exactly two locales, so a dropdown would add
 * a click and hide the current state instead of showing it. Persists via
 * the `NEXT_LOCALE` cookie (see `i18n/actions.ts`) — the same choice
 * survives a reload and a brand-new session on the same browser, which is
 * what "recuerde la preferencia del usuario" (a `localStorage`-only choice
 * would not: it wouldn't apply on the very first server-rendered paint,
 * causing a flash of the wrong language).
 *
 * `variant="ghost"` for the marketing header (sits next to plain nav
 * links); `variant="subtle"` for the dashboard header (sits in a denser
 * icon cluster next to NotificationBell/AccountMenu).
 */
export function LanguageSwitcher({
  variant = "ghost",
  className,
}: {
  variant?: "ghost" | "subtle";
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common.languageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border p-0.5 text-xs font-medium",
        variant === "ghost"
          ? "border-[color-mix(in_srgb,var(--color-text)_12%,transparent)]"
          : "border-border",
        isPending && "opacity-60",
        className,
      )}
    >
      <Languages className="ml-1 mr-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => handleSelect(l)}
          disabled={isPending}
          aria-pressed={locale === l}
          className={cn(
            "rounded-[calc(var(--radius-md)-2px)] px-2 py-1 uppercase tracking-wide transition-colors",
            locale === l
              ? "bg-[var(--color-primary)] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
