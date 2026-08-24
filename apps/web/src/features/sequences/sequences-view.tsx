"use client";

import { EngagementInboxPanel } from "@/components/engagement-inbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowStatusPanel } from "@/components/workflow-status";
import { AutomationBuilder } from "@/features/sequences/automation-builder";
import { MessageLibrary } from "@/features/sequences/message-library";

/** Secuencias — estado de DynamicSequence, bandeja de engagement entrante,
 *  y la biblioteca de mensajes reutilizables para armarlas. */
export function SequencesView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Dynamic Sequence · Smart Engagement</p>
        <div className="mt-1">
          <h1 className="bee-display">Secuencias</h1>
          <p className="bee-caption mt-1">
            Cadencias multicanal en curso, eventos entrantes que requieren respuesta, y el contenido con el que arrancarlas
          </p>
        </div>
      </header>

      <Tabs defaultValue="estado">
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
          <div className="grid gap-4 lg:grid-cols-2">
            <WorkflowStatusPanel />
            <EngagementInboxPanel />
          </div>
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
