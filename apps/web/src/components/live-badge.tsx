"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { useIsDemoMode } from "@/lib/demo/mode";

/**
 * The one "En vivo / Datos demo" indicator. In the sandbox it renders
 * nothing: every visitor there is on demo data by definition, and the
 * sandbox header says so once — a badge repeating it on each page (and
 * inside several panels) was noise. On the real dashboard it still tells
 * the truth per page: live API, or the sample fallback because the API
 * couldn't be reached.
 */
export function LiveBadge({
  live,
  className,
  hideLive = false,
}: {
  live: boolean;
  className?: string;
  /** Only show the demo/fallback state, never the "live" confirmation. */
  hideLive?: boolean;
}) {
  const t = useTranslations("common.liveBadge");
  const demo = useIsDemoMode();
  if (demo) return null;
  if (live && hideLive) return null;
  return (
    <Badge variant={live ? "success" : "warning"} className={className}>
      {live ? t("live") : t("demo")}
    </Badge>
  );
}
