"use client";

import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useIcpCriteria } from "@/hooks/queries/use-icp";
import { useOrgApiKeys } from "@/hooks/queries/use-org-api-keys";
import { useAuth } from "@/providers/auth-provider";

interface Step {
  key: "icp" | "signals" | "opportunity" | "team";
  href: string;
  done: boolean;
}

/**
 * Checklist a brand-new organization sees at the top of Resumen until the
 * four things that make BEE useful are in place: an ICP to score against,
 * a source of signals, at least one opportunity, and a teammate. Before
 * this, an empty account landed on a page of "nada urgente" / "todavía no
 * hay…" cards with no indication of what to do next — every panel was an
 * honest empty state, none of them was a next step. Hides itself for good
 * once every step is done; each row deep-links to the exact page.
 *
 * Only OWNER/ADMIN can complete the ICP/keys/team steps, so a MEMBER is
 * never shown a checklist they can't act on.
 */
export function GettingStartedCard({
  signalCount,
  opportunityCount,
  userCount,
}: {
  signalCount: number;
  opportunityCount: number;
  userCount: number;
}) {
  const t = useTranslations("dashboardOverview.gettingStarted");
  const { user } = useAuth();
  const { data: icpResult, isLoading: icpLoading } = useIcpCriteria();
  const { data: keysResult, isLoading: keysLoading } = useOrgApiKeys();

  const canSetUp = user?.role === "owner" || user?.role === "admin";
  if (!canSetUp || icpLoading || keysLoading) return null;

  const icp = icpResult?.data;
  const icpDone = Boolean(
    icp && Object.values(icp).some((values) => Array.isArray(values) && values.length > 0),
  );
  const keysDone = (keysResult?.data ?? []).some((k) => k.is_active) || signalCount > 0;

  const steps: Step[] = [
    { key: "icp", href: "/dashboard/signals?tab=priority", done: icpDone },
    { key: "signals", href: "/dashboard/integrations", done: keysDone },
    { key: "opportunity", href: "/dashboard/crm", done: opportunityCount > 0 },
    { key: "team", href: "/dashboard/team", done: userCount > 1 },
  ];
  if (steps.every((s) => s.done)) return null;

  return (
    <section className="bee-bento bee-outline--blue bee-bento-pad mb-4">
      <p className="bee-eyebrow">{t("eyebrow")}</p>
      <h2 className="mt-1 text-base font-semibold">{t("title")}</h2>
      <p className="bee-caption mt-1">{t("subtitle")}</p>

      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="bee-surface flex items-start gap-4 p-4"
            aria-current={step.done ? undefined : "step"}
          >
            {step.done ? (
              <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-text)]" aria-hidden />
            ) : (
              <Circle className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : ""}`}>
                {t(`steps.${step.key}.title`)}
              </p>
              <p className="bee-caption mt-1">{t(`steps.${step.key}.description`)}</p>
              {step.done ? (
                <p className="bee-micro mt-2 font-medium text-[var(--color-text)]">{t("done")}</p>
              ) : (
                <Link
                  href={step.href}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text)] hover:underline"
                >
                  {t(`steps.${step.key}.cta`)}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
