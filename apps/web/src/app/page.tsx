import Link from "next/link";
import { Activity, ArrowRight, Boxes, ShieldCheck, Zap } from "lucide-react";

import { MarketingHeader } from "@/components/marketing-header";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Activity,
    title: "Motor de señales",
    description:
      "Motor nativo de webhooks que ingiere triggers de mercado en tiempo real — funding, contrataciones, adopción tech — y los puntúa al instante.",
    tone: "bee-bento",
  },
  {
    icon: Boxes,
    title: "Analizadores modulares",
    description:
      "Añade inteligencia insertando un analizador. El motor, la API y el schema no cambian — SOLID desde el día uno.",
    tone: "bee-bento bee-bento--primary",
  },
  {
    icon: Zap,
    title: "Señal → Oportunidad",
    description:
      "Cada señal cualificada se fusiona con un lead y una estrategia recomendada en una oportunidad accionable y priorizada.",
    tone: "bee-bento bee-bento--warm",
  },
  {
    icon: ShieldCheck,
    title: "Seguro por diseño",
    description:
      "Webhooks firmados HMAC y secretos por entorno. Las credenciales nunca tocan el código.",
    tone: "bee-bento bee-bento--muted",
  },
];

const pipeline = [
  { step: "01", label: "Señal", detail: "Webhook / crawler / CRM" },
  { step: "02", label: "Análisis", detail: "Clasificar · puntuar · enriquecer" },
  { step: "03", label: "Estrategia", detail: "Próxima mejor acción" },
  { step: "04", label: "Oportunidad", detail: "Lead + señal + play" },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <p className="bee-eyebrow">Sales Force Intelligence</p>
            <h1 className="bee-display mt-3 max-w-3xl text-balance">
              El sistema vivo que convierte señales de mercado en ingresos.
            </h1>
            <p className="bee-caption mt-4 max-w-2xl text-base">
              BEE detecta los momentos que importan — una ronda de funding, una contratación clave,
              una nueva herramienta — y ejecuta el play correcto, automáticamente.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bee-btn--primary">
                <Link href="/dashboard">
                  Abrir el hive <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
                  Explorar la API
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="bee-bento-grid">
            {pipeline.map((p, i) => (
              <div
                key={p.step}
                className={`bee-span-3 bee-bento bee-bento-pad ${i % 2 === 0 ? "bee-bento--primary" : ""}`}
              >
                <div className="bee-eyebrow">{p.step}</div>
                <div className="mt-2 text-base font-semibold">{p.label}</div>
                <div className="bee-caption">{p.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="bee-eyebrow">Plataforma</p>
          <h2 className="mt-2 text-xl font-semibold">Diseñado para equipos de revenue</h2>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className={`${f.tone} bee-bento-pad`}>
                <div className="flex gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center border border-border bg-background">
                    <f.icon className="size-5 stroke-[1.25]" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="bee-caption mt-1">{f.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>BEE — Sales Force Intelligence</span>
          <span>Modular · Eficiente · Consciente del mercado</span>
        </div>
      </footer>
    </div>
  );
}
