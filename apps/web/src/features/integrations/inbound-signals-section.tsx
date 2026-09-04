"use client";

import { useTranslations } from "next-intl";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { useOrgApiKeys } from "@/hooks/queries/use-org-api-keys";
import { getApiBaseUrl } from "@/lib/api/client";

/**
 * The one integration every BEE account needs and nothing else on this
 * page explained: how signals actually get *in*. The backend has accepted
 * `POST /api/v1/signals/webhook` (authenticated per tenant with the same
 * organization API key the BI feeds use, via `X-BEE-Org-Key`) since the
 * multi-tenant work, but the only place a person could learn the URL was
 * the OpenAPI docs — a new account ended up with an empty dashboard and no
 * visible path to fill it. This panel is that path: endpoint, header, a
 * copy-pasteable example, and a pointer to where the key comes from.
 */
export function InboundSignalsSection() {
  const t = useTranslations("workspace.integrations.inbound");
  const { data: keysResult } = useOrgApiKeys();
  const activeKeys = (keysResult?.data ?? []).filter((k) => k.is_active);
  const endpoint = `${getApiBaseUrl()}/api/v1/signals/webhook`;
  const example = [
    `curl -X POST ${endpoint} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "X-BEE-Org-Key: <tu-api-key>" \\`,
    `  -d '{"title": "Acme raised a $20M Series B", "event": "funding.round.announced",`,
    `       "external_id": "crm:evt_123", "company": {"name": "Acme", "domain": "acme.com"},`,
    `       "lead": {"full_name": "Jane Doe", "email": "jane@acme.com", "title": "VP Sales"}}'`,
  ].join("\n");

  return (
    <OverviewCard title={t("title")} caption={t("subtitle")}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="bee-micro font-medium">{t("endpointLabel")}</p>
            <code className="mt-1 block truncate rounded-[var(--radius-sm)] bg-[var(--color-primary)]/15 px-2 py-1 text-micro">
              POST {endpoint}
            </code>
          </div>
          <div className="min-w-0">
            <p className="bee-micro font-medium">{t("headerLabel")}</p>
            <code className="mt-1 block truncate rounded-[var(--radius-sm)] bg-[var(--color-primary)]/15 px-2 py-1 text-micro">
              X-BEE-Org-Key: &lt;api-key&gt;
            </code>
          </div>
        </div>

        <div className="min-w-0">
          <p className="bee-micro font-medium">{t("exampleLabel")}</p>
          <pre className="mt-1 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-primary)]/15 px-3 py-2 text-micro leading-relaxed">
            {example}
          </pre>
        </div>

        <p className="bee-micro">
          {activeKeys.length > 0 ? t("keyReady", { count: activeKeys.length }) : t("noKeyHint")}{" "}
          <a
            href={`${getApiBaseUrl()}/docs`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-text)] hover:underline"
          >
            {t("docsLink")}
          </a>
        </p>
      </div>
    </OverviewCard>
  );
}
