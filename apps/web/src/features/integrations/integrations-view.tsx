"use client";

import { Briefcase, Building2, Cloud, Mail, Ticket, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyLine, StateChip, StateWord } from "@/features/control/components/primitives";
import { Field } from "@/features/crm/drawer/primitives";
import { BiFeedSection } from "@/features/integrations/bi-feed-section";
import { DailyDigestSection } from "@/features/integrations/daily-digest-section";
import { InboundSignalsSection } from "@/features/integrations/inbound-signals-section";
import { MarketSourcesSection } from "@/features/integrations/market-sources-section";
import { OutboundWebhooksSection } from "@/features/team/outbound-webhooks-section";
import type { Locale } from "@/i18n/locales";
import { useIsDemoMode } from "@/lib/demo/mode";
import { formatRelativeTime } from "@/lib/i18n/format";
import { useAuth } from "@/providers/auth-provider";
import {
  useConnectOAuthProvider,
  useDisconnectOAuthProvider,
  useImportFromHubSpot,
  useImportFromSalesforce,
  useIntegrations,
  useSetJiraProjectKey,
} from "@/hooks/queries/use-integrations";
import type { IntegrationStatus, OAuthProvider, SalesforceImportSummary } from "@/lib/api/integrations";

/** Connections are surfaces, not signals: lavender. Connected is the hue
 *  at 45 % behind ink text, not connected is the page grey. */
const HUE = TONE.calm;

const CONNECTED_LABELS: Record<string, string> = {
  gmail: "Gmail",
  linkedin: "LinkedIn",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  jira: "Jira",
};

// Categories drive the order the provider cards land in — see
// IntegrationStatus.category on the backend
// (app.api.v1.endpoints.integrations.list_integrations).
const CATEGORY_ORDER = ["crm", "email", "social", "automation", "bi", "pm"] as const;

// A plain, generic mark per provider — never a brand's own logo (BEE
// draws no icon in color; see palette rules), same reasoning as
// ChannelsBox's own CHANNEL_ICON in learning-boxes.tsx. Salesforce and
// HubSpot share Cloud/Building2 (both "a CRM in the cloud"), not because
// they're the same thing, just because neither has a closer generic
// lucide glyph than the other CRM connector already claimed.
const PROVIDER_ICON: Record<OAuthProvider, LucideIcon> = {
  gmail: Mail,
  linkedin: Briefcase,
  salesforce: Cloud,
  hubspot: Building2,
  jira: Ticket,
};

// Good next candidates from the roadmap (docs/ROADMAP.md, point 4) — real
// data would come from `list_integrations` the day one of these ships; a
// static list here is honest about it, never a "Conectar" button that
// does nothing. Order matches the roadmap's own.
const COMING_SOON = ["calendar", "whatsapp", "notion", "drive", "indeed"] as const;

/** Reads the one-time ?connected=<provider> / ?integration_error=... query
 * params left by an OAuth callback redirect (see
 * app.api.v1.endpoints.integrations) and turns them into a toast, then
 * cleans the URL so a refresh doesn't replay the same toast. Plain
 * window.location instead of useSearchParams so this page can stay
 * statically prerendered like the rest of the Dashboard, matching every
 * other client-only browser read in this codebase (e.g. lib/demo/mode.ts). */
function useOAuthCallbackToast() {
  const t = useTranslations("workspace.integrations");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("integration_error");
    if (!connected && !error) return;

    if (connected) {
      toast.success(t("connectedToast", { label: CONNECTED_LABELS[connected] ?? connected }));
    }
    if (error) {
      toast.error(t.has(`callbackErrors.${error}`) ? t(`callbackErrors.${error}`) : t("callbackErrors.generic"));
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("integration_error");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Server `detail` sentences are Spanish; translate by `detail_code` when the
 * code is known to this build, otherwise show the sentence as-is. */
function useIntegrationDetail() {
  const t = useTranslations("workspace.integrations.detailCodes");
  return (status: IntegrationStatus): string | null => {
    const code = status.detail_code;
    if (code && t.has(code)) return t(code, status.detail_params ?? {});
    return status.detail;
  };
}

/**
 * One account, one white card: name, what connecting it changes (one
 * line), the state as a chip, when it was connected, and the one action —
 * Conectar or Desconectar — as a ghost button. Provider-specific extras
 * (import the CRM, the Jira project) sit under it as quiet text actions.
 */
function ProviderCard({
  provider,
  label,
  category,
  connectedCopy,
  disconnectedCopy,
  status,
  canManage,
  children,
}: {
  provider: OAuthProvider;
  label: string;
  category: string;
  connectedCopy: (accountLabel: string) => string;
  disconnectedCopy: string;
  status: IntegrationStatus;
  canManage: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("workspace.integrations");
  const locale = useLocale() as Locale;
  const detailOf = useIntegrationDetail();
  const connect = useConnectOAuthProvider(provider);
  const disconnect = useDisconnectOAuthProvider(provider);

  async function handleDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(t("disconnectedToast", { label }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("disconnectError"));
    }
  }

  async function handleConnect() {
    try {
      await connect.mutateAsync();
      // On success the browser navigates away to the provider — nothing else to do here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("connectError"));
    }
  }

  const detail = detailOf(status);
  const Icon = PROVIDER_ICON[provider];

  return (
    <section className="bee-card" style={{ gridColumn: "span 4" }}>
      <div className="bee-card__body flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]" style={{ background: tint(HUE, 45) }}>
            <Icon className="size-5 text-[var(--color-text)]" aria-hidden />
          </span>
          <StateChip hue={HUE} level={status.connected ? 45 : "rest"}>
            {status.connected ? t("connected") : t("notConnected")}
          </StateChip>
        </div>
        <div>
          <p className="bee-card-title !mb-0">{label}</p>
          <p className="bee-caption">{category}</p>
        </div>
        <p className="line-clamp-3 text-sm">{status.connected ? connectedCopy(status.account_email ?? t("defaultAccountLabel")) : disconnectedCopy}</p>
        <span className="bee-caption truncate">
          {status.connected_at ? t("card.connectedWhen", { when: formatRelativeTime(status.connected_at, locale) }) : t("card.neverConnected")}
        </span>
        {status.last_error && (
          <p className="bee-caption">
            {status.last_error} {t("lastErrorSuffix")}
          </p>
        )}
        {detail && !status.connected && <p className="bee-caption">{detail}</p>}
        {status.connected && children}
        {canManage && (
          <div className="mt-auto flex justify-end pt-1">
            {status.connected ? (
              <button type="button" onClick={handleDisconnect} disabled={disconnect.isPending} className="bee-btn-ghost text-xs">
                {disconnect.isPending ? t("disconnecting") : t("disconnect")}
              </button>
            ) : (
              <button type="button" onClick={handleConnect} disabled={connect.isPending} className="bee-btn-text text-xs font-medium">
                {connect.isPending ? t("redirecting") : t("connectPrefix", { label })} →
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function summarizeImport(t: ReturnType<typeof useTranslations>, summary: SalesforceImportSummary, label: string): string {
  const total =
    summary.companies.created + summary.companies.updated + summary.leads.created + summary.leads.updated + summary.opportunities.created + summary.opportunities.updated;
  if (total === 0) return t("import.noNew");
  return t("import.summary", {
    label,
    companies: summary.companies.created + summary.companies.updated,
    leads: summary.leads.created + summary.leads.updated,
    opportunities: summary.opportunities.created + summary.opportunities.updated,
  });
}

/** Shared body for the "importar CRM" action — Salesforce's and
 * HubSpot's importers return the exact same summary shape (see
 * SalesforceImportSummary / HubSpotImportSummary), so only the mutation
 * hook underneath differs; each provider gets a one-line wrapper below
 * that calls its own hook and hands the result here. */
function CrmImportButtonBody({ isPending, onImport }: { isPending: boolean; onImport: () => Promise<void> }) {
  const t = useTranslations("workspace.integrations");
  return (
    <button type="button" onClick={onImport} disabled={isPending} className="bee-btn-text self-start text-xs">
      {isPending ? t("import.importing") : t("import.button")}
    </button>
  );
}

function SalesforceImportButton() {
  const t = useTranslations("workspace.integrations");
  const importFromSalesforce = useImportFromSalesforce();

  async function handleImport() {
    try {
      const summary = await importFromSalesforce.mutateAsync();
      if (summary.errors.length > 0) {
        toast.warning(`${summarizeImport(t, summary, "Salesforce")} ${t("import.withErrorsPrefix")} ${summary.errors.join(" · ")}`);
      } else {
        toast.success(summarizeImport(t, summary, "Salesforce"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("import.genericError", { label: "Salesforce" }));
    }
  }

  return <CrmImportButtonBody isPending={importFromSalesforce.isPending} onImport={handleImport} />;
}

function HubSpotImportButton() {
  const t = useTranslations("workspace.integrations");
  const importFromHubSpot = useImportFromHubSpot();

  async function handleImport() {
    try {
      const summary = await importFromHubSpot.mutateAsync();
      if (summary.errors.length > 0) {
        toast.warning(`${summarizeImport(t, summary, "HubSpot")} ${t("import.withErrorsPrefix")} ${summary.errors.join(" · ")}`);
      } else {
        toast.success(summarizeImport(t, summary, "HubSpot"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("import.genericError", { label: "HubSpot" }));
    }
  }

  return <CrmImportButtonBody isPending={importFromHubSpot.isPending} onImport={handleImport} />;
}

/** The one setting opportunity-stage sync needs beyond the OAuth
 * connection itself — which Jira project JiraSyncHandler creates issues
 * in (see app.services.workflow_orchestrator.handlers on the backend).
 * A small inline field under the connected Jira card instead of a
 * Connect-time prompt, since BEE has no way to list an org's Jira
 * projects without an extra API scope this integration doesn't ask for —
 * the project key is typed in by hand, same as pasting any other
 * external id. */
function JiraConfigForm({ status }: { status: IntegrationStatus }) {
  const t = useTranslations("workspace.integrations.jira");
  const detailOf = useIntegrationDetail();
  const setProjectKey = useSetJiraProjectKey();
  const [value, setValue] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      await setProjectKey.mutateAsync(value.trim().toUpperCase());
      toast.success(t("configSaved", { key: value.trim().toUpperCase() }));
      setValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("configError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Field label={t("projectKeyLabel")} hint={detailOf(status) ?? undefined}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("projectKeyPlaceholder")} className="bee-input" />
      </Field>
      <button type="submit" disabled={!value.trim() || setProjectKey.isPending} className="bee-btn-text self-start text-xs">
        {setProjectKey.isPending ? t("saving") : t("saveProjectKey")}
      </button>
    </form>
  );
}

/** Server-wide channels (SMTP, X): one credential for the whole
 *  deployment, read-only here so it is clear they are another thing. */
function ServerChannelsCard({ channels }: { channels: IntegrationStatus[] }) {
  const t = useTranslations("workspace.integrations.serverChannels");
  const detailOf = useIntegrationDetail();
  return (
    <OverviewCard span={4} title={t("title")} caption={t("caption")}>
      {channels.length === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <ul className="bee-fill flex min-h-0 flex-col justify-around">
          {channels.map((status) => (
            <li key={status.provider} className="bee-row justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{status.label}</p>
                <p className="truncate bee-micro">{detailOf(status)}</p>
              </div>
              <StateWord hue={HUE} level={status.connected ? 100 : "rest"}>
                {status.connected ? t("connected") : t("mock")}
              </StateWord>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

/** The good candidates from the roadmap that aren't built yet — plain
 *  chips, no button, no status dot: never reads as connectable, only as
 *  "coming". Same lavender hue as the rest of Conexiones. */
function ComingSoonSection({ span = 4 }: { span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12 }) {
  const t = useTranslations("workspace.integrations.comingSoon");
  return (
    <OverviewCard span={span} title={t("title")} caption={t("caption")}>
      <ul className="flex flex-wrap content-start gap-2">
        {COMING_SOON.map((key) => (
          <li key={key} className="flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1 text-sm font-medium" style={{ background: tint(TONE.calm, 45) }}>
            {t(`items.${key}.label`)}
            <span className="rounded-full bg-[var(--color-card)] px-2 py-0.5 bee-micro">{t("tag")}</span>
          </li>
        ))}
      </ul>
    </OverviewCard>
  );
}

/** Integraciones — cada organización conecta sus propias cuentas de Gmail
 *  y LinkedIn (OAuth real, botón de conectar/desconectar) en vez de
 *  compartir el relay SMTP / el token de LinkedIn del servidor. Email
 *  (SMTP) y X siguen siendo credenciales del servidor completo, no por
 *  cuenta — se muestran aparte, de solo lectura, para que quede claro que
 *  son otra cosa (ver app.services.omnichannel). Every box is a card in
 *  the same 12-column grid the rest of BEE uses: one span-4 card per
 *  account, then the webhook-shaped connections (inbound signals, market
 *  sources, the daily digest, BI feeds, outbound webhooks).
 *  `showHeader=false` when embedded as the Conexiones tab of Control. */
export function IntegrationsView({ showHeader = true }: { showHeader?: boolean } = {}) {
  const t = useTranslations("workspace.integrations");
  useOAuthCallbackToast();
  const { user } = useAuth();
  // In /probar there's no logged-in user at all, so the real owner/admin
  // check would hide every "Conectar" button — but the sandbox already
  // blocks the OAuth redirect itself (isDemoMode() in lib/api/integrations.ts
  // throws before it ever leaves the page), so it's safe to let the buttons
  // render there too instead of showing an inert, all-read-only screen.
  const isDemo = useIsDemoMode();
  const canManage = isDemo || user?.role === "owner" || user?.role === "admin";
  const { data: result, isLoading } = useIntegrations();
  const statuses = result?.data ?? [];
  const orgProviders = statuses.filter((s) => s.scope === "organization");
  const serverChannels = statuses.filter((s) => s.scope === "server");

  // Ordered by category (uncategorized last) instead of hand-picked
  // provider blocks — a 4th/5th CRM connector needs a new entry in
  // list_integrations, never a new JSX block here.
  const rank = (s: IntegrationStatus) => {
    const i = CATEGORY_ORDER.indexOf(s.category as (typeof CATEGORY_ORDER)[number]);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  const ordered = [...orgProviders].sort((a, b) => rank(a) - rank(b));
  const categoryLabel = (s: IntegrationStatus) => (s.category && t.has(`categories.${s.category}`) ? t(`categories.${s.category}`) : t("categories.other"));

  // Present categories only — a filter tab for a category no provider
  // actually has yet would just be a dead end.
  const presentCategories = CATEGORY_ORDER.filter((c) => orgProviders.some((s) => s.category === c));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const filtered = categoryFilter === "all" ? ordered : ordered.filter((s) => s.category === categoryFilter);

  return (
    <div>
      {showHeader && (
        <header className="mb-4">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <div className="mt-1">
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>
        </header>
      )}

      {presentCategories.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={categoryFilter === "all" ? "bee-btn-ghost bee-btn-ghost--active text-xs" : "bee-btn-ghost text-xs"}
          >
            {t("categories.all")}
          </button>
          {presentCategories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(c)}
              className={categoryFilter === c ? "bee-btn-ghost bee-btn-ghost--active text-xs" : "bee-btn-ghost text-xs"}
            >
              {t(`categories.${c}`)}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="bee-overview">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="rounded-[var(--radius-lg)]" style={{ gridColumn: "span 4" }} />
          ))}
        </div>
      ) : (
        <div className="bee-overview">
          {filtered.map((status) => {
            const provider = status.provider as OAuthProvider;
            return (
              <ProviderCard
                key={status.provider}
                provider={provider}
                label={status.label}
                category={categoryLabel(status)}
                status={status}
                canManage={canManage}
                connectedCopy={(account) =>
                  t.has(`${status.provider}.connectedCopy`) ? t(`${status.provider}.connectedCopy`, { account }) : t("genericConnectedCopy", { label: status.label, account })
                }
                disconnectedCopy={t.has(`${status.provider}.disconnectedCopy`) ? t(`${status.provider}.disconnectedCopy`) : t("genericDisconnectedCopy", { label: status.label })}
              >
                {status.provider === "salesforce" && canManage && <SalesforceImportButton />}
                {status.provider === "hubspot" && canManage && <HubSpotImportButton />}
                {status.provider === "jira" && canManage && <JiraConfigForm status={status} />}
              </ProviderCard>
            );
          })}
          <ServerChannelsCard channels={serverChannels} />
          <ComingSoonSection />
          {!canManage && (
            <p className="bee-caption" style={{ gridColumn: "span 12" }}>
              {t("manageNotice")}
            </p>
          )}

          {/* Señales entrantes — el flujo central del producto (webhook →
             clasificación → oportunidad): la URL solo vivía en /docs. */}
          <InboundSignalsSection span={8} />

          {/* Fuentes de mercado — the proactive scan's senses. Read-only:
             sources are deployment-wide, but a person should see why press
             and hiring signals arrive with no key and what Google adds. */}
          <MarketSourcesSection span={4} />

          {/* Resumen diario — La jugada de hoy pushed to Slack/Teams. Lives
             here, next to the other webhook-shaped integrations, not in
             Equipo: it's a channel, not a people setting. */}
          <DailyDigestSection canManage={canManage} span={6} />

          {/* Reportes y BI — Power BI/Tableau/Looker Studio don't do OAuth,
             they take a URL + a key pasted into their own "Web" data
             source dialog. See BiFeedSection's own docstring. */}
          <BiFeedSection canManage={canManage} span={6} />

          {/* Automatización — n8n, Zapier, Make, o cualquier sistema propio
             se conectan apuntando su nodo "Webhook" a la URL que se genera
             aquí. Reutiliza el mismo componente que vive en Equipo. */}
          <OutboundWebhooksSection canManage={canManage} />
        </div>
      )}
    </div>
  );
}
