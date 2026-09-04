"use client";

import { useTranslations } from "next-intl";

import { MergedPageTabs } from "@/components/merged-page-tabs";
import { ControlLayout, SystemStatStrip } from "@/features/control";
import { IntegrationsView } from "@/features/integrations/integrations-view";

/** BEE Control (sandbox: datos demo) — Salud (one health board) and Conexiones (the accounts
 *  and channels BEE acts through). The four headline numbers sit under
 *  the tabs row so they start at the same height as on every other page.
 *  /dashboard/resilience still redirects here with ?tab=resilience, which
 *  the board turns into a scroll to the execution queue. Same structure
 *  and translation namespace as probar/control/page.tsx. */
export default function ProbarControlPage() {
  const tNav = useTranslations("nav");
  const t = useTranslations("probarNetworkBrandControl.control");

  return (
    <MergedPageTabs
      header={
        <header className="min-w-0">
          <p className="bee-eyebrow">{tNav("groups.operations")}</p>
          <h1 className="bee-display mt-1 truncate">{tNav("items.control")}</h1>
          <p className="bee-caption mt-1 line-clamp-2">{t("caption")}</p>
        </header>
      }
      defaultValue="health"
      belowTabs={<SystemStatStrip />}
      tabs={[
        { value: "health", label: t("tabs.health"), content: <ControlLayout /> },
        // Integraciones used to be its own sidebar page; connecting a
        // source is operations, so it lives here as a tab.
        { value: "connections", label: t("tabs.connections"), content: <IntegrationsView showHeader={false} /> },
      ]}
    />
  );
}
