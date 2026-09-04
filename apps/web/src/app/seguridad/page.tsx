import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FileClock, KeyRound, Lock, ShieldCheck, UserCheck, Webhook } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.seguridad.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Cada bullet de esta página corresponde a un mecanismo real del backend
 * (verificado en apps/api al escribir esto), no una promesa de
 * marketing: aislamiento multi-tenant por organization_id, JWT para
 * sesiones de usuario, HMAC para webhooks entrantes, secretos que solo
 * viven en variables de entorno (nunca en la base ni en logs), y un
 * audit trail de cada decisión que toma un agente. Profundiza los mismos
 * 4 bullets de GUARANTEES en app/page.tsx — no texto nuevo inventado
 * para la ocasión.
 */

const SECTION_ICONS = {
  multiTenant: Lock,
  layeredAuth: KeyRound,
  hmacWebhooks: Webhook,
  secrets: ShieldCheck,
  auditTrail: FileClock,
  humanApproval: UserCheck,
} as const;
const SECTION_KEYS = ["multiTenant", "layeredAuth", "hmacWebhooks", "secrets", "auditTrail", "humanApproval"] as const;

export default async function SeguridadPage() {
  const t = await getTranslations("legalMarketing.seguridad");

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

        <section className="mx-auto w-full max-w-5xl px-6 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECTION_KEYS.map((key) => {
              const Icon = SECTION_ICONS[key];
              return (
                <div key={key} className="bee-bento bee-bento-pad-lg">
                  <Icon className="size-5 stroke-[1.5] text-[var(--color-text)]" />
                  <h2 className="mt-3 text-sm font-semibold tracking-tight">
                    {t(`sections.${key}.title`)}
                  </h2>
                  <p className="bee-caption mt-1.5">{t(`sections.${key}.body`)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-border bg-[var(--color-primary)]/10">
          <div className="mx-auto w-full max-w-2xl px-6 py-14 text-center sm:py-16">
            <p className="bee-eyebrow">{t("questionsEyebrow")}</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">{t("questionsTitle")}</h2>
            <p className="bee-caption mx-auto mt-3 max-w-md">
              {t.rich("questionsBody", {
                link: (chunks) => (
                  <a
                    href="/contacto?source=seguridad"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
