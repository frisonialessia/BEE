"use client";

import { CrmView } from "@/features/crm/crm-view";
import { SignalsDashboard } from "@/features/signals/signals-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** The sandbox's core loop: see the signals BEE detects, then see how they
 * become a working pipeline. Strategy/battlecard detail lives one click
 * away, in the opportunity drawer, same as the real product — see
 * `probar/layout.tsx` for why this can reuse those components unmodified. */
export default function ProbarPage() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Sandbox</p>
        <h1 className="bee-display">Así ve BEE tu mercado</h1>
        <p className="bee-caption mt-1">
          Señales detectadas → pipeline priorizado → estrategia lista para ejecutar.
          Arrastra una tarjeta o abrila para ver el battlecard generado.
        </p>
      </header>

      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">Señales</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>
        <TabsContent value="signals" className="mt-6">
          <SignalsDashboard />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-6">
          <CrmView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
