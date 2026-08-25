import { Mail, Search, Star, Users } from "lucide-react";

/**
 * MarketingIntegrations — de dónde salen las señales y por dónde sale el
 * alcance, listado real (no un muro de logos de clientes inventado):
 * LinkedIn/G2/Google Search son los providers reales en
 * apps/api/app/services/external_api/providers/, y el envío de email sale
 * por SMTP/SendGrid/Resend (ver executive_agent/webhook_emitter.py). Sin
 * los logos oficiales de cada marca — ni el repo los tiene como asset ni
 * corresponde reclamar afiliación con ellos — así que cada tarjeta es un
 * ícono + nombre + qué hace, no un logotipo de terceros.
 */

const INTEGRATIONS = [
  { icon: Users, name: "LinkedIn", role: "Señales de contratación y alcance directo" },
  { icon: Star, name: "G2", role: "Señales de intención de compra por reseñas y comparaciones" },
  { icon: Search, name: "Google Search", role: "Menciones públicas y cambios de stack tecnológico" },
  { icon: Mail, name: "Email", role: "Envío de secuencias vía SMTP, SendGrid o Resend" },
] as const;

export function MarketingIntegrations() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow">Conectado con lo que ya usas</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Las señales vienen de fuentes reales.
        </h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {INTEGRATIONS.map((i) => (
          <div key={i.name} className="bee-bento bee-bento-pad flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
              <i.icon className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{i.name}</p>
              <p className="bee-caption mt-1">{i.role}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
