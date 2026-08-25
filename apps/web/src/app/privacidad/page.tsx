import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Política de Privacidad — BEE",
  description: "Qué datos recolecta BEE y qué hacemos — y qué no hacemos — con ellos.",
};

const SECTIONS = [
  {
    title: "1. Qué datos recolectamos",
    body: "Del formulario de Contacto: nombre, email, empresa y teléfono (opcionales estos dos últimos) y el mensaje que escribes. También guardamos la IP de origen, únicamente para prevenir abuso del formulario (límite de envíos por hora). Si creas una cuenta: nombre, email y el nombre de tu organización. Mientras tienes sesión iniciada, guardamos un token de sesión en el almacenamiento local de tu navegador — no una cookie de terceros.",
  },
  {
    title: "2. Qué NO hacemos",
    body: "No vendemos tus datos. No usamos cookies de publicidad ni scripts de tracking de terceros en este sitio. No compartimos los datos de tu organización con otras cuentas que usan BEE — el aislamiento es a nivel de base de datos, no una configuración que se pueda desactivar por error.",
  },
  {
    title: "3. Para qué usamos lo que recolectamos",
    body: "Para responder tu consulta cuando escribes desde Contacto, para operar tu cuenta si te registras, y para prevenir spam y abuso en formularios públicos (por eso guardamos la IP en los envíos de contacto).",
  },
  {
    title: "4. Cuánto tiempo lo guardamos",
    body: "Los envíos del formulario de Contacto se conservan mientras sean relevantes para responderte o para nuestros registros comerciales. Puedes pedirnos que eliminemos tus datos en cualquier momento — ver el punto 6.",
  },
  {
    title: "5. Seguridad",
    body: "Ver la página de Seguridad para el detalle técnico: aislamiento multi-tenant, autenticación en capas, secretos que nunca se persisten en la base ni se registran en logs.",
  },
  {
    title: "6. Tus derechos",
    body: "Puedes pedirnos acceder, corregir o eliminar los datos que tenemos sobre ti escribiéndonos desde Contacto. Vamos a responder tu pedido en un plazo razonable.",
  },
  {
    title: "7. Cambios a esta política",
    body: "Si cambiamos algo material sobre cómo recolectamos o usamos datos, lo vamos a reflejar en esta misma página.",
  },
] as const;

export default function PrivacidadPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
          <p className="bee-eyebrow text-center">Legal</p>
          <h1 className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Política de Privacidad
          </h1>

          <div className="mt-8 flex items-start gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-primary)]/20 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-chart-2)]" />
            <p className="bee-caption">
              Borrador de referencia que describe honestamente qué hace hoy el sistema — antes de
              operar comercialmente, hazlo revisar por un asesor legal para tu jurisdicción
              (GDPR, CCPA u otra normativa aplicable a tus usuarios).
            </p>
          </div>

          <div className="mt-10 space-y-8">
            {SECTIONS.map((s) => (
              <div key={s.title}>
                <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
                <p className="bee-caption mt-2 text-sm leading-relaxed">
                  {s.title.startsWith("5.") ? (
                    <>
                      Ver la página de{" "}
                      <Link href="/seguridad" className="font-medium text-foreground underline underline-offset-4">
                        Seguridad
                      </Link>{" "}
                      para el detalle técnico: aislamiento multi-tenant, autenticación en capas,
                      secretos que nunca se persisten en la base ni se registran en logs.
                    </>
                  ) : (
                    s.body
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="bee-micro mt-10 border-t border-[var(--color-divider)] pt-4">
            Última actualización: ver control de versiones del sitio.
          </p>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
