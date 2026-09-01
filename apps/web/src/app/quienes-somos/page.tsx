import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, Code2, ShieldCheck, Target, UserCheck } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.quienesSomos.meta");
  return { title: t("title"), description: t("description") };
}

const PRINCIPLE_ICONS = { noInventedData: ShieldCheck, finalDecision: UserCheck, weBuildWhatWeDescribe: Target } as const;
const PRINCIPLE_KEYS = ["noInventedData", "finalDecision", "weBuildWhatWeDescribe"] as const;

export default async function QuienesSomosPage() {
  const t = await getTranslations("legalMarketing.quienesSomos");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">{t("heroSubtitle")}</p>
        </section>

        <section className="border-t border-border bg-[var(--color-primary)]/10">
          <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="bee-eyebrow">{t("howWeThinkEyebrow")}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("howWeThinkTitle")}
              </h2>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PRINCIPLE_KEYS.map((key) => {
                const Icon = PRINCIPLE_ICONS[key];
                return (
                  <div key={key} className="bee-bento bee-bento-pad-lg">
                    <Icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                    <h3 className="mt-3 text-sm font-semibold tracking-tight">
                      {t(`principles.${key}.title`)}
                    </h3>
                    <p className="bee-caption mt-1.5">{t(`principles.${key}.description`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl space-y-4 px-6 py-16 sm:py-20">
          <div className="bee-bento bee-bento-pad-lg">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-4)]" />
              <div>
                <h3 className="text-sm font-semibold">{t("smallTeamTitle")}</h3>
                <p className="bee-caption mt-1.5">
                  {t.rich("smallTeamBody", {
                    link: (chunks) => (
                      <a
                        href="/contacto?source=quienes_somos"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="bee-bento bee-bento-pad-lg">
            <div className="flex items-start gap-3">
              <Code2 className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-4)]" />
              <div>
                <h3 className="text-sm font-semibold">{t("openSourceTitle")}</h3>
                <p className="bee-caption mt-1.5">{t("openSourceBody")}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
