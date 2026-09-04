"use client";

import { useTranslations } from "next-intl";

import { PendingActionsPanel } from "@/components/pending-actions";
import { AuditLogPanel, FailedEventsPanel } from "@/components/resilience-panel";
import {
  AnomaliesPanel,
  ApiStatusPanel,
  ControlLayout,
  LeadWorkspace,
  SignalStream,
  SystemHealth,
} from "@/features/control";

/** BEE Control (sandbox: datos demo) — one health board with Resiliencia as
 *  a section; see dashboard/control/page.tsx's own docstring for why. */
export default function ProbarControlPage() {
  const tNav = useTranslations("nav");
  const t = useTranslations("probarNetworkBrandControl.control");
  const tRes = useTranslations("probarForecastOps.resilience");

  return (
    <ControlLayout
      header={
        <header>
          <p className="bee-eyebrow">{tNav("groups.operations")}</p>
          <h1 className="bee-display mt-1">{tNav("items.control")}</h1>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </header>
      }
      engine={<SystemHealth />}
      dlq={<FailedEventsPanel />}
      audit={<AuditLogPanel />}
      resilienceHeader={
        <header>
          <p className="bee-eyebrow">{tRes("eyebrow")}</p>
          <h2 className="bee-card-title !mb-0 mt-1">{tRes("title")}</h2>
          <p className="bee-caption">{tRes("subtitle")}</p>
        </header>
      }
      pending={<PendingActionsPanel />}
      anomalies={<AnomaliesPanel />}
      apiStatus={<ApiStatusPanel />}
      stream={<SignalStream />}
      action={<LeadWorkspace />}
    />
  );
}
