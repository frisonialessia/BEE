import Link from "next/link";
import { Activity, ArrowRight, Boxes, ShieldCheck, Zap } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Activity,
    title: "Motor de Señales",
    description:
      "A webhook-native engine ingests market triggers in real time — funding, hiring, tech adoption — and scores them instantly.",
  },
  {
    icon: Boxes,
    title: "Pluggable analyzers",
    description:
      "Add new intelligence by dropping in an analyzer. The engine, API, and schema never change — built on SOLID from day one.",
  },
  {
    icon: Zap,
    title: "Signal → Opportunity",
    description:
      "Every qualified signal is fused with a lead and a recommended strategy into an actionable, prioritized opportunity.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    description:
      "HMAC-signed webhooks and environment-based secrets. Credentials never touch the codebase.",
  },
];

const pipeline = [
  { step: "01", label: "Signal", detail: "Webhook / crawler / CRM" },
  { step: "02", label: "Analyze", detail: "Classify · score · enrich" },
  { step: "03", label: "Strategy", detail: "Next best action" },
  { step: "04", label: "Opportunity", detail: "Lead + signal + play" },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background:radial-gradient(60%_50%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
          />
          <div className="mx-auto w-full max-w-6xl px-6 py-24 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Sales Force Intelligence
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              The living system that turns market signals into revenue.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
              BEE detects the moments that matter — a funding round, a key hire, a
              new tool — and executes the right play, automatically.
            </p>
            <div className="mt-9 flex items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Open the hive <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
                  Explore the API
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((p) => (
              <Card key={p.step}>
                <CardContent className="p-5">
                  <div className="font-mono text-xs text-primary">{p.step}</div>
                  <div className="mt-2 text-base font-medium">{p.label}</div>
                  <div className="text-sm text-muted-foreground">{p.detail}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {features.map((f) => (
              <Card key={f.title}>
                <CardContent className="flex gap-4 p-6">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {f.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>BEE — Sales Force Intelligence</span>
          <span>Modular · Efficient · Market-aware</span>
        </div>
      </footer>
    </div>
  );
}
