"use client";

import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("workspace.sequences");

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("view.eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("view.title")}</h1>
          <p className="bee-caption mt-1">{t("probarPage.subtitle")}</p>
        </div>
      </header>

      <Tabs defaultValue="biblioteca">
        <TabsList className="h-auto max-w-full flex-wrap border border-border bg-background group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="estado" className="rounded-sm">
            {t("view.tabs.status")}
          </TabsTrigger>
          <TabsTrigger value="biblioteca" className="rounded-sm">
            {t("view.tabs.library")}
          </TabsTrigger>
          <TabsTrigger value="automatizaciones" className="rounded-sm">
            {t("view.tabs.automations")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estado" className="mt-6">
          <ProbarComingSoon label={t("view.tabs.status")} icon={Activity} />
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
