"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Cloud, Download, Mail, Plug, Users, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OutboundWebhooksSection } from "@/features/team/outbound-webhooks-section";
import { useIsDemoMode } from "@/lib/demo/mode";
import { useAuth } from "@/providers/auth-provider";
import {
  useConnectOAuthProvider,
  useDisconnectOAuthProvider,
  useImportFromHubSpot,
  useImportFromSalesforce,
  useIntegrations,
} from "@/hooks/queries/use-integrations";
import type { IntegrationStatus, OAuthProvider, SalesforceImportSummary } from "@/lib/api/integrations";

const CONNECTED_LABELS: Record<string, string> = {
  gmail: "Gmail",
  linkedin: "LinkedIn",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
};

// One icon per provider, a generic fallback for whatever's added next
// (see the Integrations view's own comment on why this stays a lookup
// instead of a per-provider hardcoded JSX block). Categories drive the
// section a provider's card lands under — see IntegrationStatus.category
// on the backend (app.api.v1.endpoints.integrations.list_integrations).
const PROVIDER_ICONS: Record<string, LucideIcon> = { gmail: Mail, linkedin: Users, salesforce: Cloud, hubspot: Cloud };
const DEFAULT_PROVIDER_ICON: LucideIcon = Plug;
const CATEGORY_ORDER = ["crm", "email", "social", "automation", "bi"] as const;

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
      toast.error(
        t.has(`callbackErrors.${error}`) ? t(`callbackErrors.${error}`) : t("callbackErrors.generic"),
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("integration_error");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function OAuthProviderRow({
  provider,
  label,
  icon: Icon,
  connectedCopy,
  disconnectedCopy,
  status,
  canManage,
  children,
}: {
  provider: OAuthProvider;
  label: string;
  icon: LucideIcon;
  connectedCopy: (accountLabel: string) => string;
  disconnectedCopy: string;
  status: IntegrationStatus;
  canManage: boolean;
  /** Extra content shown only while connected — e.g. the "Importar CRM"
   * action Salesforce gets that Gmail/LinkedIn don't. */
  children?: ReactNode;
}) {
  const t = useTranslations("workspace.integrations");
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

  return (
    <div className="bee-surface bee-bento-pad">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
            <Icon className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{label}</p>
              <Badge variant={status.connected ? "success" : "outline"}>
                {status.connected ? t("connected") : t("notConnected")}
              </Badge>
            </div>
            <p className="bee-caption mt-1">
              {status.connected ? connectedCopy(status.account_email ?? t("defaultAccountLabel")) : disconnectedCopy}
            </p>
            {status.last_error && (
              <p className="mt-1 text-[11px] text-[var(--color-chart-2)]">
                {status.last_error} {t("lastErrorSuffix")}
              </p>
            )}
            {status.detail && !status.connected && <p className="bee-caption mt-1">{status.detail}</p>}
          </div>
        </div>

        {canManage && (
          <div className="shrink-0">
            {status.connected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                className="bee-btn-ghost text-xs"
              >
                {disconnect.isPending ? t("disconnecting") : t("disconnect")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connect.isPending}
                className="bee-btn bee-btn--primary text-xs"
              >
                {connect.isPending ? t("redirecting") : t("connectPrefix", { label })}
              </button>
            )}
          </div>
        )}
      </div>
      {status.connected && children}
    </div>
  );
}

function summarizeImport(t: ReturnType<typeof useTranslations>, summary: SalesforceImportSummary, label: string): string {
  const total =
    summary.companies.created + summary.companies.updated +
    summary.leads.created + summary.leads.updated +
    summary.opportunities.created + summary.opportunities.updated;
  if (total === 0) return t("import.noNew");
  return t("import.summary", {
    label,
    companies: summary.companies.created + summary.companies.updated,
    leads: summary.leads.created + summary.leads.updated,
    opportunities: summary.opportunities.created + summary.opportunities.updated,
  });
}

/** Shared body for the "importar CRM" button — Salesforce's and
 * HubSpot's importers return the exact same summary shape (see
 * SalesforceImportSummary / HubSpotImportSummary), so only the mutation
 * hook underneath differs; each provider gets a one-line wrapper below
 * that calls its own hook and hands the result here. */
function CrmImportButtonBody({
  isPending,
  onImport,
}: {
  isPending: boolean;
  onImport: () => Promise<void>;
}) {
  const t = useTranslations("workspace.integrations");
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-divider)] pt-3">
      <button
        type="button"
        onClick={onImport}
        disabled={isPending}
        className="bee-btn-ghost inline-flex items-center gap-1.5 text-xs"
      >
        <Download className="size-3.5" />
        {isPending ? t("import.importing") : t("import.button")}
      </button>
    </div>
  );
}

function SalesforceImportButton() {
  const t = useTranslations("workspace.integrations");
  const importFromSalesforce = useImportFromSalesforce();

  async function handleImport() {
    try {
      const summary = await importFromSalesforce.mutateAsync();
      if (summary.errors.length > 0) {
        toast.warning(
          `${summarizeImport(t, summary, "Salesforce")} ${t("import.withErrorsPrefix")} ${summary.errors.join(" · ")}`,
        );
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
        toast.warning(
          `${summarizeImport(t, summary, "HubSpot")} ${t("import.withErrorsPrefix")} ${summary.errors.join(" · ")}`,
        );
      } else {
        toast.success(summarizeImport(t, summary, "HubSpot"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("import.genericError", { label: "HubSpot" }));
    }
  }

  return <CrmImportButtonBody isPending={importFromHubSpot.isPending} onImport={handleImport} />;
}

function ServerChannelRow({ status }: { status: IntegrationStatus }) {
  const t = useTranslations("workspace.integrations.serverChannels");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] py-3 last:border-b-0">
      <div className="flex items-center gap-2.5">
        {status.connected ? (
          <CheckCircle2 className="size-4 shrink-0 text-[var(--color-chart-3)]" />
        ) : (
          <XCircle className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div>
          <p className="text-xs font-medium">{status.label}</p>
          <p className="bee-caption">{status.detail}</p>
        </div>
      </div>
      <Badge variant={status.connected ? "success" : "outline"} className="text-[11px]">
        {status.connected ? t("connected") : t("mock")}
      </Badge>
    </div>
  );
}

/** Integraciones — cada organización conecta sus propias cuentas de Gmail
 *  y LinkedIn (OAuth real, botón de conectar/desconectar) en vez de
 *  compartir el relay SMTP / el token de LinkedIn del servidor. Email
 *  (SMTP) y X siguen siendo credenciales del servidor completo, no por
 *  cuenta — se muestran aparte, de solo lectura, para que quede claro que
 *  son otra cosa (ver app.services.omnichannel). */
export function IntegrationsView() {
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

  // Grouped by category (falling back to a single "otras" bucket for
  // anything uncategorized) instead of three hand-picked provider blocks
  // — this is the actual point of the redesign: a 4th/5th CRM connector
  // (see the roadmap this shipped alongside) needs a new entry in
  // list_integrations, never a new JSX block here.
  const categorized = CATEGORY_ORDER.map((category) => ({
    category,
    providers: orgProviders.filter((s) => s.category === category),
  })).filter((group) => group.providers.length > 0);
  const uncategorized = orgProviders.filter((s) => !CATEGORY_ORDER.includes(s.category as (typeof CATEGORY_ORDER)[number]));

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6">
          {[...categorized, ...(uncategorized.length > 0 ? [{ category: null, providers: uncategorized }] : [])].map(
            ({ category, providers }) => (
              <section key={category ?? "other"} className="space-y-3">
                <p className="bee-eyebrow">
                  {category ? t(`categories.${category}`) : t("categories.other")}
                </p>
                {providers.map((status) => {
                  const provider = status.provider as OAuthProvider;
                  const Icon = PROVIDER_ICONS[status.provider] ?? DEFAULT_PROVIDER_ICON;
                  return (
                    <OAuthProviderRow
                      key={status.provider}
                      provider={provider}
                      label={status.label}
                      icon={Icon}
                      status={status}
                      canManage={canManage}
                      connectedCopy={(account) =>
                        t.has(`${status.provider}.connectedCopy`)
                          ? t(`${status.provider}.connectedCopy`, { account })
                          : t("genericConnectedCopy", { label: status.label, account })
                      }
                      disconnectedCopy={
                        t.has(`${status.provider}.disconnectedCopy`)
                          ? t(`${status.provider}.disconnectedCopy`)
                          : t("genericDisconnectedCopy", { label: status.label })
                      }
                    >
                      {status.provider === "salesforce" && canManage && <SalesforceImportButton />}
                      {status.provider === "hubspot" && canManage && <HubSpotImportButton />}
                    </OAuthProviderRow>
                  );
                })}
              </section>
            ),
          )}
          {!canManage && <p className="bee-caption">{t("manageNotice")}</p>}

          {/* Automatización — no es un proveedor OAuth más: n8n, Zapier,
             Make, o cualquier sistema propio se conectan apuntando su nodo
             "Webhook" a la URL que se genera aquí, no con un botón de
             Conectar. Reutiliza el mismo componente que ya vive en Equipo
             (misma data en vivo) — este es el lugar donde alguien buscando
             "conectar n8n" en realidad tiene que aterrizar. */}
          <section className="space-y-3">
            <p className="bee-eyebrow">{t("categories.automation")}</p>
            <p className="bee-caption">{t("automation.hint")}</p>
            <OutboundWebhooksSection canManage={canManage} />
          </section>

          <section className="bee-surface bee-bento-pad">
            <div className="mb-3 flex items-center gap-2">
              <Plug className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t("serverChannels.title")}</h3>
            </div>
            <p className="bee-caption mb-3">{t("serverChannels.caption")}</p>
            <div>
              {serverChannels.map((s) => (
                <ServerChannelRow key={s.provider} status={s} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
