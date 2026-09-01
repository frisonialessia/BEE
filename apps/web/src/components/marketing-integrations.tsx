import { Mail, Search, Star, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * MarketingIntegrations — de dónde salen las señales y por dónde sale el
 * alcance, listado real (no un muro de logos de clientes inventado):
 * LinkedIn/G2/Google Search son los providers reales en
 * apps/api/app/services/external_api/providers/, y el envío de email sale
 * por SMTP/SendGrid/Resend (ver executive_agent/webhook_emitter.py). Sin
 * los logos oficiales de cada marca — ni el repo los tiene como asset ni
 * corresponde reclamar afiliación con ellos — así que cada tarjeta es un
 * ícono + nombre + qué hace, no un logotipo de terceros.
 *
 * `name` no está traducido — son nombres propios/marcas (LinkedIn, G2,
 * Google Search, Email), no texto en español que necesite versión en
 * inglés.
 */

const INTEGRATIONS = [
  { icon: Users, name: "LinkedIn", id: "linkedin", tone: "bee-bento--primary" },
  { icon: Star, name: "G2", id: "g2", tone: "bee-bento--warm" },
  { icon: Search, name: "Google Search", id: "googleSearch", tone: "bee-bento--violet" },
  { icon: Mail, name: "Email", id: "email", tone: "bee-bento--muted" },
] as const;

export async function MarketingIntegrations() {
  const t = await getTranslations("landing.integrations");

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {INTEGRATIONS.map((i) => (
          <div
            key={i.name}
            className={`bee-bento bee-bento-pad bee-glass--hover flex items-start gap-3 ${i.tone}`}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
              <i.icon className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{i.name}</p>
              <p className="bee-caption mt-1">{t(`items.${i.id}`)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
