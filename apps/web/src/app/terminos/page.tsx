import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.terminos.meta");
  return { title: t("title"), description: t("description") };
}

interface LegalSection {
  title: string;
  body: string;
}

export default async function TerminosPage() {
  const t = await getTranslations("legalMarketing.terminos");
  const sections = t.raw("sections") as LegalSection[];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
          <p className="bee-eyebrow text-center">{t("eyebrow")}</p>
          <h1 className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>

          <div className="mt-8 flex items-start gap-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-primary)]/20 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-chart-2)]" />
            <p className="bee-caption">{t("draftNotice")}</p>
          </div>

          <div className="mt-10 space-y-8">
            {sections.map((s) => (
              <div key={s.title}>
                <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
                <p className="bee-caption mt-2 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <p className="bee-micro mt-10 border-t border-[var(--color-divider)] pt-4">
            {t("lastUpdated")}
          </p>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
