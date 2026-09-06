import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { TONE, mix } from "@/components/charts/palette";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.documentacion.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Documentación técnica pública: cómo funciona BEE por dentro.
 *
 * El enlace "Documentación" del encabezado apuntaba al Swagger del API
 * (`{API}/docs`), que en producción está detrás de APIKeyMiddleware y
 * responde 401 a cualquier visitante — un enlace roto en la barra de
 * navegación desde que se activó la llave. Esta página es su destino real,
 * y además dice lo que un Swagger nunca dice: por qué el sistema está
 * armado así.
 *
 * No documenta endpoints a propósito. La referencia de la API se genera
 * sola desde FastAPI y se desactualiza sola si se copia a mano; lo que no
 * se genera solo es la explicación de las capas, del camino de una señal,
 * de por qué el orden de los middleware es ese, y de qué falta. Eso es lo
 * que necesita quien tome el código.
 *
 * El contenido vive entero en messages/{es,en}/legalMarketing.json como una
 * lista de bloques tipados (`p`, `ul`, `code`, `table`, `steps`, `note`) y
 * esta página solo los dibuja. Escribir el texto en el TSX habría dejado la
 * mitad de la documentación sin traducir la primera vez que alguien la
 * ampliara con prisa.
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "code"; text: string; lang: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "steps"; items: string[] }
  | { kind: "note"; text: string };

const SECTION_IDS = [
  "arquitectura",
  "stack",
  "capas",
  "senal",
  "analizadores",
  "tenants",
  "auth",
  "middleware",
  "trabajos",
  "datos",
  "frontend",
  "pruebas",
] as const;

function Code({ text }: { text: string }) {
  return (
    // overflow-x-auto y no wrap: una línea larga de código se lee
    // desplazándola, nunca partida a media ruta (DESIGN_BRIEF §2.14).
    <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-divider)] bg-[var(--color-background)] p-4 text-[13px] leading-relaxed">
      <code className="font-mono whitespace-pre">{text}</code>
    </pre>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "p":
            return (
              <p key={i} className="bee-caption mt-3 max-w-3xl leading-relaxed">
                {b.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="mt-3 max-w-3xl space-y-2">
                {b.items.map((item) => (
                  <li key={item} className="bee-caption flex gap-2.5 leading-relaxed">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full"
                      style={{ background: TONE.marketDeep }}
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );
          case "code":
            return <Code key={i} text={b.text} />;
          case "steps":
            return (
              <ol key={i} className="mt-4 max-w-3xl space-y-3">
                {b.items.map((item, n) => (
                  <li key={item} className="flex gap-3">
                    <span
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
                      style={{ background: mix(TONE.market, 45) }}
                      aria-hidden
                    >
                      {n + 1}
                    </span>
                    <span className="bee-caption leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div
                key={i}
                className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-divider)]"
              >
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ background: mix(TONE.calm, 35) }}>
                      {b.headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row) => (
                      <tr key={row[0]} className="border-t border-[var(--color-divider)] align-top">
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            className={`px-3 py-2 ${c === 0 ? "font-medium" : "text-[var(--color-text-muted)]"}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "note":
            return (
              <p
                key={i}
                className="bee-caption mt-4 max-w-3xl rounded-xl px-4 py-3 leading-relaxed"
                style={{ background: mix(TONE.market, 14), borderLeft: `3px solid ${TONE.market}` }}
              >
                {b.text}
              </p>
            );
        }
      })}
    </>
  );
}

export default async function DocumentacionPage() {
  const t = await getTranslations("legalMarketing.documentacion");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 pb-6 pt-14 sm:pt-16">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-2 max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="bee-caption mt-4 max-w-2xl text-base">{t("heroSubtitle")}</p>
          <p className="bee-micro mt-3">{t("updated")}</p>
        </section>

        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 pb-14 lg:grid-cols-[15rem_1fr] lg:gap-14">
          {/* Índice pegajoso solo en pantallas donde sobra alto para él; en
              teléfono ocuparía la primera pantalla entera antes del texto. */}
          <nav aria-label={t("tocTitle")} className="hidden lg:block">
            <div className="sticky top-8">
              <p className="bee-eyebrow">{t("tocTitle")}</p>
              <ul className="mt-3 space-y-1.5">
                {SECTION_IDS.map((id) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="bee-caption block truncate hover:text-[var(--color-text)]"
                    >
                      {t(`sections.${id}.title`)}
                    </a>
                  </li>
                ))}
                <li className="pt-2">
                  <a href="#roadmap" className="bee-caption block font-medium hover:text-[var(--color-text)]">
                    {t("roadmapTitle")}
                  </a>
                </li>
              </ul>
            </div>
          </nav>

          <div className="min-w-0">
            {SECTION_IDS.map((id) => (
              <section key={id} id={id} className="scroll-mt-8 border-t border-border pt-8 first:border-t-0 first:pt-0 [&+section]:mt-10">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {t(`sections.${id}.title`)}
                </h2>
                <Blocks blocks={t.raw(`sections.${id}.blocks`) as Block[]} />
              </section>
            ))}

            <section id="roadmap" className="mt-12 scroll-mt-8 border-t border-border pt-8">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("roadmapTitle")}</h2>
              <p className="bee-caption mt-3 max-w-3xl leading-relaxed">{t("roadmapIntro")}</p>

              <h3 className="mt-8 text-base font-semibold">{t("roadmapNowTitle")}</h3>
              <ul className="mt-3 grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                {(t.raw("roadmapNow") as string[]).map((item) => (
                  <li key={item} className="bee-caption flex gap-2.5 leading-relaxed">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full"
                      style={{ background: "#52c871" }}
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-10 text-base font-semibold">{t("roadmapNextTitle")}</h3>
              {/* Numerada porque el orden es el mensaje: cada punto desbloquea
                  al siguiente, y los dos primeros son un solo bloqueante. */}
              <ol className="mt-4 max-w-3xl space-y-4">
                {(t.raw("roadmapNext") as { title: string; text: string }[]).map((item, i) => (
                  <li key={item.title} className="flex gap-3">
                    <span
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
                      style={{ background: mix(TONE.urgency, 45) }}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="bee-caption mt-1 block leading-relaxed">{item.text}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-10">
                <a
                  href="https://github.com/frisonialessia/BEE"
                  target="_blank"
                  rel="noreferrer"
                  className="bee-btn bee-btn--primary bee-cta-lift"
                >
                  {t("repoCta")}
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
