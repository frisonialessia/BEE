"use client";

import { Activity } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProbarComingSoon } from "@/features/probar/probar-coming-soon";
import { AutomationBuilder } from "@/features/sequences/automation-builder";
import { MessageLibrary } from "@/features/sequences/message-library";

/**
 * Secuencias en el sandbox — a partial live section, not full-page gated
 * like Control/Resiliencia/Red/Voz de marca nor fully live like the rest of
 * `PROBAR_LIVE_SECTIONS`. Biblioteca de mensajes and Automatizaciones are
 * just user-authored content (templates, a flow definition) — the same
 * kind of thing "Simula tu empresa" already lets a visitor create — so
 * `lib/api/templates.ts`/`lib/api/sequences.ts` back them with a local
 * store like everywhere else live. Estado (running-sequence status +
 * SmartEngagementEngine's AI sentiment/intent classification) is real
 * backend processing, not a business record — same category as
 * Resiliencia's audit log, so it stays honestly gated instead of faking an
 * AI engine. See `probar/nav-items.ts` for the fuller rationale.
 */
export default function ProbarSequencesPage() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Secuencia dinámica · Engagement inteligente</p>
        <div className="mt-1">
          <h1 className="bee-display">Secuencias</h1>
          <p className="bee-caption mt-1">
            El contenido con el que arrancarlas y el flujo multicanal que las define — el estado
            en vivo y la bandeja de engagement necesitan una cuenta real.
          </p>
        </div>
      </header>

      <Tabs defaultValue="biblioteca">
        <TabsList className="border border-border bg-background">
          <TabsTrigger value="estado" className="rounded-sm">
            Estado
          </TabsTrigger>
          <TabsTrigger value="biblioteca" className="rounded-sm">
            Biblioteca de mensajes
          </TabsTrigger>
          <TabsTrigger value="automatizaciones" className="rounded-sm">
            Automatizaciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estado" className="mt-6">
          <ProbarComingSoon label="Estado" icon={Activity} />
        </TabsContent>

        <TabsContent value="biblioteca" className="mt-6">
          <MessageLibrary />
        </TabsContent>

        <TabsContent value="automatizaciones" className="mt-6">
          <AutomationBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}
