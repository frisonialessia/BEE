"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCreateOrgApiKey, useOrgApiKeys, useRevokeOrgApiKey } from "@/hooks/queries/use-org-api-keys";
import type { OrgApiKeyCreated } from "@/lib/api/org-api-keys";

const FEEDS = ["companies", "leads", "opportunities"] as const;

function feedUrl(feed: (typeof FEEDS)[number], key: string | null): string {
  const base = `${getApiBaseUrl()}/api/v1/bi/${feed}`;
  return key ? `${base}?org_key=${key}` : base;
}

function NewKeyForm({ onDone }: { onDone: (created: OrgApiKeyCreated) => void }) {
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
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("keyNamePlaceholder")}
        required
        className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
      />
      <button
        type="submit"
        disabled={!name.trim() || createKey.isPending}
        className="bee-btn bee-btn--primary shrink-0 text-xs"
      >
        {createKey.isPending ? t("generating") : t("generateKey")}
      </button>
    </form>
  );
}

/** Power BI / Tableau / Looker Studio / a spreadsheet's own "from web"
 *  import — none of these speak OAuth, so unlike Gmail/LinkedIn/
 *  Salesforce/HubSpot above, there's no Connect button here. What a BI
 *  tool actually needs is a URL + a key it can paste into its own "Web"
 *  data source dialog once — this generates that key (the same
 *  organization API key POST /organizations/api-keys already issues for
 *  webhook callers) and shows the three feed URLs ready to copy. See
 *  app.api.v1.endpoints.bi_feed's module docstring for the full
 *  reasoning (three normalized feeds, not one flattened export). */
export function BiFeedSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("workspace.integrations.biFeed");
  const { data: keysResult, isLoading } = useOrgApiKeys();
  const revokeKey = useRevokeOrgApiKey();
  const [showNew, setShowNew] = useState(false);
  const [justCreated, setJustCreated] = useState<OrgApiKeyCreated | null>(null);

  const keys = keysResult?.data ?? [];

  return (
    <OverviewCard title={t("title")} caption={t("subtitle")}>
      <div className="space-y-4">
        {justCreated && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/10 p-4">
            <p className="text-xs font-semibold">{t("secretReveal.title")}</p>
            <code className="mt-2 block break-all rounded-[var(--radius-md)] bg-[var(--color-card)] px-3 py-2 text-xs">
              {justCreated.api_key}
            </code>
            <p className="mt-2 bee-micro">{t("secretReveal.help")}</p>
            <button type="button" onClick={() => setJustCreated(null)} className="bee-btn-ghost mt-2 text-xs">
              {t("secretReveal.confirm")}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {FEEDS.map((feed) => (
            <div key={feed} className="min-w-0">
              <p className="bee-micro font-medium text-muted-foreground">{t(`feeds.${feed}`)}</p>
              <code className="mt-1 block truncate rounded-[var(--radius-sm)] bg-[var(--color-primary)]/15 px-2 py-1 text-micro">
                {feedUrl(feed, justCreated?.api_key ?? null)}
              </code>
            </div>
          ))}
          {!justCreated && <p className="bee-micro">{t("noKeyYetHint")}</p>}
        </div>

        {canManage && (
          <div className="space-y-2 border-t border-[var(--color-divider)] pt-3">
            {isLoading ? null : keys.length > 0 ? (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between gap-2 bee-micro">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <KeyRound className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {k.name} — {k.key_prefix}…
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => revokeKey.mutate(k.id)}
                      disabled={revokeKey.isPending}
                      className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-[var(--color-chart-2)]/20 hover:text-[var(--color-text)]"
                      aria-label={t("revokeAria")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {showNew ? (
              <NewKeyForm
                onDone={(created) => {
                  setShowNew(false);
                  setJustCreated(created);
                }}
              />
            ) : (
              <button type="button" onClick={() => setShowNew(true)} className="bee-btn-ghost text-xs">
                {t("newKey")}
              </button>
            )}
          </div>
        )}
      </div>
    </OverviewCard>
  );
}
