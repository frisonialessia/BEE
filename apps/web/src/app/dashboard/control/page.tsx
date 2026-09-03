"use client";

import { useTranslations } from "next-intl";

import { MergedPageTabs } from "@/components/merged-page-tabs";
import {
  AnomaliesPanel,
  ApiStatusPanel,
  ControlLayout,
  LeadWorkspace,
  SignalHexMap,
  SignalStream,
  SystemHealth,
} from "@/features/control";
import { ResilienceView } from "@/features/resilience/resilience-view";

/** BEE Control — workspace operativo CRM, con Resiliencia (auditoría de
 *  agentes, dead-letter queue, anomalías, cola de ejecución) como segunda
 *  pestaña — ambas son observabilidad del sistema, antes dos filas del
 *  sidebar (ver lib/nav-items.ts). /dashboard/resilience sigue existiendo
 *  como redirect a ?tab=resilience. Misma estructura y namespace de
 *  traducción que probar/control/page.tsx — antes esta versión hardcodeaba
 *  español directo (nunca cambiaba con el switch de idioma) mientras la del
 *  sandbox sí traducía. */
export default function ControlPage() {
  const tNav = useTranslations("nav");
  const t = useTranslations("probarNetworkBrandControl.control");

  return (
    <div>
      <header className="mb-4">
        <p className="bee-eyebrow">{tNav("groups.operations")}</p>
        <h1 className="bee-display mt-1">{tNav("items.control")}</h1>
        <p className="bee-caption mt-1">{t("caption")}</p>
      </header>

      <MergedPageTabs
        defaultValue="overview"
        tabs={[
          {
            value: "overview",
            label: t("overviewTab"),
            content: (
              <ControlLayout
                header={null}
                action={<LeadWorkspace />}
                hive={<SignalHexMap height={240} maxLeads={200} className="h-full" />}
                intelligence={<SystemHealth />}
                stream={<SignalStream />}
                apiStatus={<ApiStatusPanel />}
                anomalies={<AnomaliesPanel />}
              />
            ),
          },
          { value: "resilience", label: tNav("items.resilience"), content: <ResilienceView showHeader={false} /> },
        ]}
      />
    </div>
  );
}
