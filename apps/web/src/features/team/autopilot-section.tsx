"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutopilotConfig, useUpdateAutopilotConfig } from "@/hooks/queries/use-autopilot";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Autopilot Guardrails — OWNER-only. The one setting in this app that
 * changes whether an outbound action can skip human approval, so it's
 * gated stricter than every other org setting (OWNER only, not
 * OWNER/ADMIN) and shown with an explicit warning, never a quiet toggle.
 *
 * Ships fully built but dormant: no BEE-generated action today actually
 * passes a confidence score into the gateway, so turning this on has no
 * effect yet — see PersonalBrandService/OmnichannelGateway's own docs.
 * The config still saves and is honored the moment a caller does.
 */
export function AutopilotSection() {
  const t = useTranslations("workspace.team.autopilot");
  const { user: currentUser } = useAuth();
  const { data: config, isLoading } = useAutopilotConfig();
  const updateConfig = useUpdateAutopilotConfig();

  const isOwner = currentUser?.role === "owner";
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(0.9);
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [excludedIdsText, setExcludedIdsText] = useState("");

  if (!isOwner) return null;

  function openEditor() {
    setEnabled(config?.enabled ?? false);
    setThreshold(config?.confidence_threshold ?? 0.9);
    setForbiddenWords(config?.forbidden_words ?? []);
    setExcludedIdsText((config?.excluded_company_ids ?? []).join("\n"));
    setOpen(true);
  }

  function addWord() {
    const word = newWord.trim();
    if (!word || forbiddenWords.includes(word)) return;
    setForbiddenWords((prev) => [...prev, word]);
    setNewWord("");
  }

  function removeWord(word: string) {
    setForbiddenWords((prev) => prev.filter((w) => w !== word));
  }

  async function handleSave() {
    const excludedIds = excludedIdsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => UUID_RE.test(s));
    try {
      await updateConfig.mutateAsync({
        enabled,
        confidence_threshold: threshold,
        forbidden_words: forbiddenWords,
        excluded_company_ids: excludedIds,
      });
      toast.success(t("saved"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveError"));
    }
  }

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 text-base font-semibold">{t("title")}</h2>
          <p className="bee-caption mt-1 max-w-2xl">{t("subtitle")}</p>
        </div>
        <Badge variant={config?.enabled ? "warning" : "outline"}>
          {config?.enabled ? t("statusOn") : t("statusOff")}
        </Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !open ? (
        <button type="button" onClick={openEditor} className="bee-btn-ghost text-xs">
          {t("configure")}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bee-inset flex items-start gap-2 p-3">
            <span className="text-sm">⚠</span>
            <p className="bee-caption">{t("warning")}</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t("enableLabel")}
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("thresholdLabel", { pct: Math.round(threshold * 100) })}
            </label>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(Number.parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="bee-caption">{t("thresholdHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("forbiddenLabel")}</label>
            <p className="bee-caption mb-2">{t("forbiddenHint")}</p>
            {forbiddenWords.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {forbiddenWords.map((word) => (
                  <Badge key={word} variant="outline" className="gap-1">
                    {word}
                    <button
                      type="button"
                      onClick={() => removeWord(word)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={t("remove")}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder={t("forbiddenPlaceholder")}
                className="bee-input flex-1"
              />
              <button type="button" onClick={addWord} disabled={!newWord.trim()} className="bee-btn-ghost text-xs">
                {t("add")}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("excludedLabel")}</label>
            <p className="bee-caption mb-2">{t("excludedHint")}</p>
            <textarea
              value={excludedIdsText}
              onChange={(e) => setExcludedIdsText(e.target.value)}
              placeholder={t("excludedPlaceholder")}
              rows={3}
              className="bee-input resize-none font-mono text-xs"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={updateConfig.isPending}
              className="bee-btn bee-btn--primary"
            >
              {updateConfig.isPending ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="bee-btn-ghost">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
