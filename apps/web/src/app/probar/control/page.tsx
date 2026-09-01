"use client";

import { useTranslations } from "next-intl";

import {
  AnomaliesPanel,
  ApiStatusPanel,
  ControlLayout,
  LeadWorkspace,
  SignalHexMap,
  SignalStream,
  SystemHealth,
} from "@/features/control";

/** BEE Control — workspace operativo CRM (sandbox: datos demo). */
export default function ProbarControlPage() {
  const tNav = useTranslations("nav");
  const t = useTranslations("probarNetworkBrandControl.control");

  return (
    <ControlLayout
      header={
        <>
          <p className="bee-eyebrow">{tNav("groups.operations")}</p>
          <h1 className="bee-display mt-1">{tNav("items.control")}</h1>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </>
      }
      action={<LeadWorkspace />}
      hive={<SignalHexMap height={240} maxLeads={200} className="h-full" />}
      intelligence={<SystemHealth />}
      stream={<SignalStream />}
      apiStatus={<ApiStatusPanel />}
      anomalies={<AnomaliesPanel />}
    />
  );
}
