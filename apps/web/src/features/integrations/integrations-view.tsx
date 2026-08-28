"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Cloud, Download, Mail, Plug, Users, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import {
  useConnectOAuthProvider,
  useDisconnectOAuthProvider,
  useImportFromSalesforce,
  useIntegrations,
} from "@/hooks/queries/use-integrations";
import type { IntegrationStatus, OAuthProvider, SalesforceImportSummary } from "@/lib/api/integrations";

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  denied: "Cancelaste la conexión — no se conectó nada.",
  invalid_state: "El enlace de conexión expiró o no es válido. Intenta de nuevo.",
  invalid_request: "El proveedor no envió los datos esperados. Intenta de nuevo.",
  exchange_failed: "El proveedor rechazó la conexión. Intenta de nuevo en unos minutos.",
};

const CONNECTED_LABELS: Record<string, string> = { gmail: "Gmail", linkedin: "LinkedIn", salesforce: "Salesforce" };

/** Reads the one-time ?connected=<provider> / ?integration_error=... query
 * params left by an OAuth callback redirect (see
 * app.api.v1.endpoints.integrations) and turns them into a toast, then
 * cleans the URL so a refresh doesn't replay the same toast. Plain
 * window.location instead of useSearchParams so this page can stay
 * statically prerendered like the rest of the Dashboard, matching every
 * other client-only browser read in this codebase (e.g. lib/demo/mode.ts). */
function useOAuthCallbackToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("integration_error");
    if (!connected && !error) return;

    if (connected) toast.success(`${CONNECTED_LABELS[connected] ?? connected} conectado correctamente.`);
    if (error) toast.error(CALLBACK_ERROR_MESSAGES[error] ?? "No se pudo completar la conexión.");

    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("integration_error");
    window.history.replaceState({}, "", url.toString());
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
  const connect = useConnectOAuthProvider(provider);
  const disconnect = useDisconnectOAuthProvider(provider);

  async function handleDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(`${label} desconectado.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar.");
    }
  }

  async function handleConnect() {
    try {
      await connect.mutateAsync();
      // On success the browser navigates away to the provider — nothing else to do here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar la conexión.");
    }
  }

  return (
    <div className="bee-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
            <Icon className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{label}</p>
              <Badge variant={status.connected ? "success" : "outline"}>
                {status.connected ? "Conectado" : "No conectado"}
              </Badge>
            </div>
            <p className="bee-caption mt-1">
              {status.connected ? connectedCopy(status.account_email ?? "esta cuenta") : disconnectedCopy}
            </p>
            {status.last_error && (
              <p className="mt-1 text-[11px] text-[var(--color-chart-2)]">{status.last_error} — reconecta la cuenta.</p>
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
                {disconnect.isPending ? "Desconectando…" : "Desconectar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connect.isPending}
                className="bee-btn bee-btn--primary text-xs"
              >
                {connect.isPending ? "Redirigiendo…" : `Conectar ${label}`}
              </button>
            )}
          </div>
        )}
      </div>
      {status.connected && children}
    </div>
  );
}

function summarizeImport(summary: SalesforceImportSummary): string {
  const total =
    summary.companies.created + summary.companies.updated +
    summary.leads.created + summary.leads.updated +
    summary.opportunities.created + summary.opportunities.updated;
  if (total === 0) return "No había nada nuevo que importar.";
  return (
    `${summary.companies.created + summary.companies.updated} empresa${summary.companies.created + summary.companies.updated === 1 ? "" : "s"}, ` +
    `${summary.leads.created + summary.leads.updated} lead${summary.leads.created + summary.leads.updated === 1 ? "" : "s"}, ` +
    `${summary.opportunities.created + summary.opportunities.updated} oportunidad${summary.opportunities.created + summary.opportunities.updated === 1 ? "" : "es"} desde Salesforce.`
  );
}

function SalesforceImportButton() {
  const importFromSalesforce = useImportFromSalesforce();

  async function handleImport() {
    try {
      const summary = await importFromSalesforce.mutateAsync();
      if (summary.errors.length > 0) {
        toast.warning(`${summarizeImport(summary)} Con errores: ${summary.errors.join(" · ")}`);
      } else {
        toast.success(summarizeImport(summary));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo importar de Salesforce.");
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-divider)] pt-3">
      <button
        type="button"
        onClick={handleImport}
        disabled={importFromSalesforce.isPending}
        className="bee-btn-ghost inline-flex items-center gap-1.5 text-xs"
      >
        <Download className="size-3.5" />
        {importFromSalesforce.isPending ? "Importando…" : "Importar Accounts, Contacts, Leads y Opportunities"}
      </button>
    </div>
  );
}

function ServerChannelRow({ status }: { status: IntegrationStatus }) {
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
        {status.connected ? "conectado" : "modo simulado"}
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
  useOAuthCallbackToast();
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin";
  const { data: result, isLoading } = useIntegrations();
  const statuses = result?.data ?? [];
  const gmail = statuses.find((s) => s.provider === "gmail");
  const linkedin = statuses.find((s) => s.provider === "linkedin");
  const salesforce = statuses.find((s) => s.provider === "salesforce");
  const serverChannels = statuses.filter((s) => s.scope === "server");

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Cuentas conectadas</p>
        <div className="mt-1">
          <h1 className="bee-display">Integraciones</h1>
          <p className="bee-caption mt-1">
            Conecta tus propias cuentas para que BEE actúe en tu nombre — el envío de secuencias
            por Gmail o LinkedIn sale desde tu cuenta real, no desde una compartida del servidor.
            Salesforce trae tu CRM a BEE, de solo lectura.
          </p>
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
          {gmail && (
            <OAuthProviderRow
              provider="gmail"
              label="Gmail"
              icon={Mail}
              status={gmail}
              canManage={canManage}
              connectedCopy={(account) => `Las secuencias envían correos desde ${account}, no desde un servidor compartido.`}
              disconnectedCopy="Conecta tu cuenta de Gmail para que las secuencias envíen correos desde tu propia bandeja."
            />
          )}
          {linkedin && (
            <OAuthProviderRow
              provider="linkedin"
              label="LinkedIn"
              icon={Users}
              status={linkedin}
              canManage={canManage}
              connectedCopy={(account) => `Los mensajes y solicitudes de conexión salen desde ${account}, no desde un token compartido.`}
              disconnectedCopy="Conecta tu cuenta de LinkedIn para que las secuencias envíen mensajes y solicitudes de conexión desde tu propio perfil."
            />
          )}
          {salesforce && (
            <OAuthProviderRow
              provider="salesforce"
              label="Salesforce"
              icon={Cloud}
              status={salesforce}
              canManage={canManage}
              connectedCopy={(account) => `Conectado a ${account}. Trae Accounts, Contacts, Leads y Opportunities cuando quieras — nunca escribe de vuelta en Salesforce.`}
              disconnectedCopy="Conecta tu org de Salesforce para traer tu CRM a BEE — empresas, contactos y oportunidades, de solo lectura."
            >
              {canManage && <SalesforceImportButton />}
            </OAuthProviderRow>
          )}
          {!canManage && (
            <p className="bee-caption">
              Solo el dueño o un administrador de la organización puede conectar o desconectar cuentas.
            </p>
          )}

          <section className="bee-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <Plug className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Canales del servidor</h3>
            </div>
            <p className="bee-caption mb-3">
              Configurados una sola vez para todo el despliegue de BEE, no por cuenta — ver
              variables de entorno del backend si necesitas cambiarlos.
            </p>
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
