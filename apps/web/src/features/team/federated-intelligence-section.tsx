"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useFederatedIntelligenceConfig,
  useUpdateFederatedIntelligenceConfig,
} from "@/hooks/queries/use-federated-intelligence";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

/**
 * Federated Signal Intelligence — OWNER-only opt-in. Same stricter gate as
 * AutopilotSection (OWNER, not OWNER/ADMIN): this changes whether the
 * organization's own closed-deal history is counted, anonymized and
 * aggregate-only, toward every other opted-in organization's cross-tenant
 * priors — and symmetrically, whether this org's own signal confidence
 * gets calibrated by everyone else's. See
 * app.services.federated_intelligence's module docstring for the full
 * privacy model (k-anonymity floor, what is and isn't ever shared).
 */
export function FederatedIntelligenceSection() {
  const t = useTranslations("workspace.team.federatedIntelligence");
  const { user: currentUser } = useAuth();
  const { data: config, isLoading } = useFederatedIntelligenceConfig();
  const updateConfig = useUpdateFederatedIntelligenceConfig();
  const [pending, setPending] = useState(false);

  const isOwner = currentUser?.role === "owner";
  if (!isOwner) return null;

  async function handleToggle(optIn: boolean) {
    setPending(true);
    try {
      await updateConfig.mutateAsync({ opt_in: optIn });
      toast.success(optIn ? t("optedInToast") : t("optedOutToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <OverviewCard
      title={t("title")}
      caption={t("subtitle")}
      action={
        isLoading ? null : (
          <Badge variant={config?.opt_in ? "success" : "outline"}>
            {config?.opt_in ? t("statusOn") : t("statusOff")}
          </Badge>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="space-y-4">
          <div className="bee-bento flex items-start gap-2 p-4">
            <span className="text-sm">ⓘ</span>
            <p className="bee-caption">{t("explainer")}</p>
          </div>
          <Label className="text-sm font-normal">
            <Checkbox
              checked={config?.opt_in ?? false}
              disabled={pending}
              onCheckedChange={(checked) => void handleToggle(checked === true)}
            />
            {t("toggleLabel")}
          </Label>
        </div>
      )}
    </OverviewCard>
  );
}
