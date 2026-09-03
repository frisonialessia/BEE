"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAutopilotConfig,
  useSimulateAutopilotConfig,
  useUpdateAutopilotConfig,
} from "@/hooks/queries/use-autopilot";
import type { AutopilotSimulationReport } from "@/lib/api/organizations";
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
 *
 * Also renders the Guardrail Backtesting Sandbox — a read-only "what would
 * this candidate config have done to my real history" backtest against
 * AutopilotGuardrailService.run_simulation, so an owner has actual evidence
 * before raising confidence_threshold rather than a guess.
 */
export function AutopilotSection() {
  const t = useTranslations("workspace.team.autopilot");
  const { user: currentUser } = useAuth();
  const { data: config, isLoading } = useAutopilotConfig();
  const updateConfig = useUpdateAutopilotConfig();
  const simulateConfig = useSimulateAutopilotConfig();

  const isOwner = currentUser?.role === "owner";
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(0.9);
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [excludedIdsText, setExcludedIdsText] = useState("");
  const [lookbackDays, setLookbackDays] = useState(90);
  const [report, setReport] = useState<AutopilotSimulationReport | null>(null);

  if (!isOwner) return null;

  function parseExcludedIds() {
    return excludedIdsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => UUID_RE.test(s));
  }

  function openEditor() {
    setEnabled(config?.enabled ?? false);
    setThreshold(config?.confidence_threshold ?? 0.9);
    setForbiddenWords(config?.forbidden_words ?? []);
    setExcludedIdsText((config?.excluded_company_ids ?? []).join("\n"));
    setReport(null);
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
    try {
      await updateConfig.mutateAsync({
        enabled,
        confidence_threshold: threshold,
        forbidden_words: forbiddenWords,
        excluded_company_ids: parseExcludedIds(),
      });
      toast.success(t("saved"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveError"));
    }
  }

  /** Read-only — backtests the candidate values currently in the editor
   * against real history, without saving anything. See
   * AutopilotGuardrailService.run_simulation's docstring for what this
   * replays and its two documented data limitations. */
  async function handleSimulate() {
    try {
      const result = await simulateConfig.mutateAsync({
        confidence_threshold: threshold,
        forbidden_words: forbiddenWords,
        excluded_company_ids: parseExcludedIds(),
        lookback_days: lookbackDays,
      });
      setReport(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("simulation.error"));
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

          <Label className="text-sm font-normal">
            <Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />
            {t("enableLabel")}
          </Label>

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
              className="bee-input font-mono text-xs"
            />
          </div>

          <div className="bee-inset space-y-3 p-3">
            <p className="bee-eyebrow">{t("simulation.eyebrow")}</p>
            <p className="bee-caption">{t("simulation.hint")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("simulation.lookbackLabel")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(Number(e.target.value) || 90)}
                  className="bee-input w-24"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSimulate()}
                disabled={simulateConfig.isPending}
                className="bee-btn-ghost text-xs"
              >
                {simulateConfig.isPending ? t("simulation.running") : t("simulation.run")}
              </button>
            </div>

            {report && (
              <div className="space-y-1.5 border-t border-border pt-3 text-sm">
                <p className="font-medium">{t("simulation.reportTitle", { days: report.lookback_days })}</p>
                {report.evaluated_count === 0 ? (
                  <p className="bee-caption">{t("simulation.noHistory")}</p>
                ) : (
                  <>
                    <p>{t("simulation.evaluated", { count: report.evaluated_count })}</p>
                    <p>
                      {t("simulation.wouldApprove", {
                        count: report.would_auto_approve_count,
                        pct: Math.round(report.would_auto_approve_rate * 100),
                      })}
                    </p>
                    <p>
                      {report.auto_approved_win_rate !== null
                        ? t("simulation.autoWinRate", {
                            pct: Math.round(report.auto_approved_win_rate * 100),
                          })
                        : t("simulation.noAutoOutcomeData")}
                    </p>
                    <p>
                      {report.manual_review_win_rate !== null
                        ? t("simulation.manualWinRate", {
                            pct: Math.round(report.manual_review_win_rate * 100),
                          })
                        : t("simulation.noManualOutcomeData")}
                    </p>
                    {report.near_miss_excluded_count > 0 && (
                      <p className="bee-caption">
                        {t("simulation.nearMiss", { count: report.near_miss_excluded_count })}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
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
