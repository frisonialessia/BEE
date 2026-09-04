import { Mail, Search, Star, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/marketing-motion";

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
 *
 * Cards are white with a small tinted icon chip, not a full-color wash —
 * a directory of real sources reads more like a spec sheet than a set of
 * colored blocks, and it keeps this section from competing with Platform's
 * full-wash cards right above it for the same visual trick.
 */

// ink: written out as a full color-mix() expression rather than through a
// shared custom property — Lightning CSS constant-folds a color-mix()-only
// custom property into every CSS rule that reads it and drops the property
// itself, so a var() read from an inline style (invisible to that
// optimization pass, as this one is) resolves to nothing.
const INTEGRATIONS = [
  { icon: Users, name: "LinkedIn", id: "linkedin", chip: "bee-chip--primary", ink: "var(--color-chart-4)" },
  {
    icon: Star,
    name: "G2",
    id: "g2",
    chip: "bee-chip--warm",
    ink: "color-mix(in srgb, var(--color-accent-warm) 70%, var(--color-text) 30%)",
  },
  {
    icon: Search,
    name: "Google Search",
    id: "googleSearch",
    chip: "bee-chip--violet",
    ink: "color-mix(in srgb, var(--color-chart-6) 65%, var(--color-text) 35%)",
  },
  {
    icon: Mail,
    name: "Email",
    id: "email",
    chip: "bee-chip--muted",
    ink: "color-mix(in srgb, var(--color-chart-5) 70%, var(--color-text) 30%)",
  },
] as const;

export async function MarketingIntegrations() {
  const t = await getTranslations("landing.integrations");

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow bee-eyebrow--muted">{t("eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
      </Reveal>
      <Reveal stagger className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {INTEGRATIONS.map((i) => (
          <div key={i.name} className="bee-bento bee-bento-pad bee-glass--hover flex items-start gap-3">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] ${i.chip}`}
            >
              <i.icon className="size-4 stroke-[1.5]" style={{ color: i.ink }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{i.name}</p>
              <p className="bee-caption mt-1">{t(`items.${i.id}`)}</p>
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
