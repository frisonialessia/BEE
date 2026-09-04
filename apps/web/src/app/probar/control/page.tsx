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

/** BEE Control — workspace operativo CRM (sandbox: datos demo), con
 *  Resiliencia como segunda pestaña — ver dashboard/control/page.tsx's
 *  own docstring for why. */
export default function ProbarControlPage() {
  const tNav = useTranslations("nav");
  const t = useTranslations("probarNetworkBrandControl.control");

  return (
    <div>
      <MergedPageTabs
        header={
          <header>
            <p className="bee-eyebrow">{tNav("groups.operations")}</p>
            <h1 className="bee-display mt-1">{tNav("items.control")}</h1>
            <p className="bee-caption mt-1">{t("caption")}</p>
          </header>
        }
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
