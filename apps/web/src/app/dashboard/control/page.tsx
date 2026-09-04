"use client";

import { useTranslations } from "next-intl";

import { MergedPageTabs } from "@/components/merged-page-tabs";
import { PendingActionsPanel } from "@/components/pending-actions";
import { IntegrationsView } from "@/features/integrations/integrations-view";
import { AuditLogPanel, FailedEventsPanel } from "@/components/resilience-panel";
import {
  AnomaliesPanel,
  ApiStatusPanel,
  ControlLayout,
  LeadWorkspace,
  SignalStream,
  SystemHealth,
} from "@/features/control";

/** BEE Control — one health board. Sistema and Resiliencia used to be two
 *  tabs whose strips repeated the same queue depth and error counts; now
 *  the strip is one (ingest, queue, errors, model confidence, sources) and
 *  Resiliencia is a section of the same page (see control-layout.tsx).
 *  /dashboard/resilience still redirects here with ?tab=resilience, which
 *  the layout turns into a scroll to that section. Same structure and
 *  translation namespace as probar/control/page.tsx. */
export default function ControlPage() {
  const tNav = useTranslations("nav");
  const t = useTranslations("probarNetworkBrandControl.control");
  const tRes = useTranslations("probarForecastOps.resilience");

  return (
    <MergedPageTabs
      header={
        <header>
          <p className="bee-eyebrow">{tNav("groups.operations")}</p>
          <h1 className="bee-display mt-1">{tNav("items.control")}</h1>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </header>
      }
      defaultValue="health"
      tabs={[
        {
          value: "health",
          label: t("tabs.health"),
          content: (
            <ControlLayout
              header={null}
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
          ),
        },
        {
          // Integraciones used to be its own sidebar page; connecting a
          // source is operations, so it lives here as a tab.
          value: "connections",
          label: t("tabs.connections"),
          content: <IntegrationsView showHeader={false} />,
        },
      ]}
    />
  );
}
