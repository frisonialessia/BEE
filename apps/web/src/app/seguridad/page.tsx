import type { Metadata } from "next";
import { FileClock, KeyRound, Lock, ShieldCheck, UserCheck, Webhook } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Seguridad — BEE",
  description: "Cómo BEE aísla tus datos, autentica cada llamada y registra cada decisión.",
};

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

const SECTIONS = [
  {
    icon: Lock,
    title: "Aislamiento multi-tenant real",
    body: "Cada tabla que guarda datos de una cuenta está scopeada por organización — no una bandera opcional que alguien puede olvidar activar, sino parte del modelo de datos desde el diseño. Un endpoint que no filtra por tu organización simplemente no puede devolverte datos de otra cuenta.",
  },
  {
    icon: KeyRound,
    title: "Autenticación en capas",
    body: "Las sesiones de usuario usan JWT firmado, con expiración de 7 días. El acceso de servicio a servicio (integraciones, el propio frontend) usa una clave de API independiente — dos límites de confianza separados, no un único secreto compartido para todo.",
  },
  {
    icon: Webhook,
    title: "Webhooks firmados con HMAC",
    body: "Cada webhook entrante se valida contra una firma HMAC antes de procesarse. La verificación de firma está activada por defecto en producción — desactivarla es una decisión explícita, no el comportamiento por omisión.",
  },
  {
    icon: ShieldCheck,
    title: "Secretos que nunca tocan el código ni la base",
    body: "Las credenciales de proveedores externos se leen únicamente desde variables de entorno. Nunca se persisten en la base de datos ni se escriben en un log — cuando algo necesita mostrarse en un mensaje de diagnóstico, el valor real queda enmascarado.",
  },
  {
    icon: FileClock,
    title: "Cada decisión de un agente queda registrada",
    body: "El sistema mantiene un registro de auditoría de las decisiones automáticas — qué señal disparó qué acción, y cuándo. No es una caja negra: hay una cadena de decisiones que se puede reconstruir.",
  },
  {
    icon: UserCheck,
    title: "Ningún envío externo sin aprobación humana",
    body: "El motor prepara la próxima acción — el mensaje, el canal, el momento — pero un email, un mensaje de LinkedIn o una secuencia completa nunca salen sin que una persona dé luz verde explícita.",
  },
] as const;

export default function SeguridadPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">Seguridad</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Diseñado para que conectar tu CRM no sea un riesgo.
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">
            No son promesas de una página de ventas — son mecanismos que existen hoy en el
            backend de BEE, los mismos que sostienen las garantías del resto del sitio.
          </p>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <div key={s.title} className="bee-bento bee-bento-pad-lg">
                <s.icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                <h2 className="mt-3 text-sm font-semibold tracking-tight">{s.title}</h2>
                <p className="bee-caption mt-1.5">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-[var(--color-primary)]/10">
          <div className="mx-auto w-full max-w-2xl px-6 py-14 text-center sm:py-16">
            <p className="bee-eyebrow">¿Preguntas de seguridad específicas?</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              Un evaluador técnico también puede escribirnos.
            </h2>
            <p className="bee-caption mx-auto mt-3 max-w-md">
              Si tu proceso de compra necesita un cuestionario de seguridad o una llamada con
              alguien técnico, contanos desde{" "}
              <a href="/contacto?source=seguridad" className="font-medium text-foreground underline underline-offset-4">
                Contacto
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
