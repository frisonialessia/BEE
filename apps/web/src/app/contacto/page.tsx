import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Code2, LogIn, Send } from "lucide-react";

import { ContactForm } from "@/components/contact-form";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.contacto.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Página pública de contacto — destino real de todos los "Comenzar ahora"
 * de la landing. El envío va a POST /api/v1/contact (ver
 * apps/api/app/api/v1/endpoints/contact.py) y se persiste de verdad — nada
 * de un formulario que solo simula un éxito. `source` (leído de la query)
 * deja registrado desde qué CTA llegó cada visitante, para que quien
 * triage estos leads vea qué parte de la página realmente convierte.
 *
 * Layout: two columns that start at the top and each wrap their content.
 * The form card sits inside a plain wrapper on purpose — the global
 * `.grid > .bee-bento { height: 100% }` rule would otherwise stretch it to
 * the row and leave a tall empty white box under the fields. The card has
 * a lavender header strip (eyebrow + one-line promise), honey focus rings
 * on its inputs (.bee-contact-card in globals.css) and a plain primary
 * submit. The three notes on the left are compact rows, one hue each.
 */

const NOTES = [
  { id: "afterSubmit", icon: Send, hue: "var(--color-chart-4)" },
  { id: "haveAccount", icon: LogIn, hue: "var(--color-chart-1)" },
  { id: "mvpNotice", icon: Code2, hue: "var(--color-chart-6)" },
] as const;

export default async function ContactoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawSource = params.source;
  const source = typeof rawSource === "string" ? rawSource : undefined;
  const t = await getTranslations("legalMarketing.contacto");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 py-12 lg:py-14">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("heroTitle")}</h1>
              <p className="bee-caption mt-4 max-w-sm text-base">{t("heroSubtitle")}</p>

              <ul className="mt-8 divide-y divide-border border-y border-border">
                {NOTES.map((note) => (
                  <li key={note.id} className="flex items-start gap-3 py-4">
                    <span
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${note.hue} 20%, var(--color-card))`, color: note.hue }}
                    >
                      <note.icon className="size-4 stroke-[1.5]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t(`${note.id}Title`)}</p>
                      <p className="bee-caption mt-1">{t(`${note.id}Body`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="bee-contact-card bee-bento overflow-hidden p-0">
                <div className="px-6 py-4" style={{ background: "var(--color-primary)" }}>
                  <p className="bee-eyebrow bee-eyebrow--blue">{t("formEyebrow")}</p>
                  <p className="mt-1 text-sm font-medium">{t("formPromise")}</p>
                </div>
                <div className="bee-bento-pad-lg">
                  <ContactForm source={source} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
