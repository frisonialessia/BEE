"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Field } from "@/features/crm/drawer/primitives";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCreateOrgApiKey, useOrgApiKeys, useRevokeOrgApiKey } from "@/hooks/queries/use-org-api-keys";
import type { OrgApiKeyCreated } from "@/lib/api/org-api-keys";

const FEEDS = ["companies", "leads", "opportunities"] as const;

function feedUrl(feed: (typeof FEEDS)[number], key: string | null): string {
  const base = `${getApiBaseUrl()}/api/v1/bi/${feed}`;
  return key ? `${base}?org_key=${key}` : base;
}

function NewKeyForm({ onDone, onCancel }: { onDone: (created: OrgApiKeyCreated) => void; onCancel: () => void }) {
  const t = useTranslations("workspace.integrations.biFeed");
  const createKey = useCreateOrgApiKey();
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createKey.mutateAsync(name.trim());
    onDone(created);
    setName("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Field label={t("keyNameLabel")}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("keyNamePlaceholder")} required className="bee-input" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className="bee-btn-ghost text-xs">
          {t("cancel")}
        </button>
        <button type="submit" disabled={!name.trim() || createKey.isPending} className="bee-btn bee-btn--primary text-xs">
          {createKey.isPending ? t("generating") : t("generateKey")}
        </button>
      </div>
    </form>
  );
}

/** Power BI / Tableau / Looker Studio / a spreadsheet's own "from web"
 *  import — none of these speak OAuth, so unlike Gmail/LinkedIn/
 *  Salesforce/HubSpot, there's no Connect button here. What a BI tool
 *  actually needs is a URL + a key it can paste into its own "Web" data
 *  source dialog once — this generates that key (the same organization
 *  API key POST /organizations/api-keys already issues for webhook
 *  callers) and shows the three feed URLs ready to copy. See
 *  app.api.v1.endpoints.bi_feed's module docstring for the full reasoning
 *  (three normalized feeds, not one flattened export). */
export function BiFeedSection({ canManage, span = 12 }: { canManage: boolean; span?: 4 | 6 | 8 | 12 }) {
  const t = useTranslations("workspace.integrations.biFeed");
  const { data: keysResult, isLoading } = useOrgApiKeys();
  const revokeKey = useRevokeOrgApiKey();
  const [showNew, setShowNew] = useState(false);
  const [justCreated, setJustCreated] = useState<OrgApiKeyCreated | null>(null);

  const keys = keysResult?.data ?? [];

  return (
    <OverviewCard span={span} title={t("title")} caption={t("subtitle")}>
      <div className="bee-fill flex flex-col gap-3">
        {justCreated && (
          <div className="rounded-[var(--radius-md)] p-3" style={{ background: tint(TONE.calm, 45) }}>
            <p className="text-sm font-medium">{t("secretReveal.title")}</p>
            <code className="mt-2 block break-all rounded-[var(--radius-sm)] bg-[var(--color-card)] px-3 py-2 text-xs">{justCreated.api_key}</code>
            <p className="mt-2 bee-micro">{t("secretReveal.help")}</p>
            <button type="button" onClick={() => setJustCreated(null)} className="bee-btn-ghost mt-2 text-xs">
              {t("secretReveal.confirm")}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {FEEDS.map((feed) => (
            <div key={feed} className="min-w-0">
              <p className="bee-caption">{t(`feeds.${feed}`)}</p>
              <code className="mt-1 block truncate rounded-[var(--radius-sm)] bg-[var(--color-background)] px-2 py-1 text-xs">{feedUrl(feed, justCreated?.api_key ?? null)}</code>
            </div>
          ))}
          {!justCreated && <p className="bee-micro">{t("noKeyYetHint")}</p>}
        </div>

        {canManage && (
          <div className="mt-auto flex flex-col gap-2 border-t border-[var(--color-divider)] pt-3">
            {!isLoading && keys.length > 0 && (
              <ul>
                {keys.map((k) => (
                  <li key={k.id} className="bee-row justify-between !py-1.5">
                    <span className="truncate bee-caption">
                      {k.name} — {k.key_prefix}…
                    </span>
                    <button type="button" onClick={() => revokeKey.mutate(k.id)} disabled={revokeKey.isPending} className="bee-btn-text text-xs" aria-label={t("revokeAria")}>
                      {t("revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showNew ? (
              <NewKeyForm
                onCancel={() => setShowNew(false)}
                onDone={(created) => {
                  setShowNew(false);
                  setJustCreated(created);
                }}
              />
            ) : (
              <button type="button" onClick={() => setShowNew(true)} className="bee-btn-ghost self-start text-xs">
                {t("newKey")}
              </button>
            )}
          </div>
        )}
      </div>
    </OverviewCard>
  );
}
