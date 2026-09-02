"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { useSetTeamProfile, useTeamProfile } from "@/hooks/queries/use-teams";
import type { Locale } from "@/i18n/locales";
import { getSignalTypeLabels } from "@/lib/format";
import { ApiError } from "@/types/api";
import type { TeamOut } from "@/types/auth";
import type { SignalType } from "@/types/domain";

/** One team's signal-weight/research-focus editor — collapsed by default
 * (a badge summary of its current weights), expands into an editable form.
 * Mirrors brand-voice.tsx's fragment-library row pattern: a list of small
 * removable entries plus an "add one" control, not a single giant form. */
function TeamProfileEditor({ team }: { team: TeamOut }) {
  const t = useTranslations("workspace.team.teamProfiles");
  const locale = useLocale() as Locale;
  const signalLabels = getSignalTypeLabels(locale);
  const { data: profile, isLoading } = useTeamProfile(team.id);
  const setProfile = useSetTeamProfile(team.id);

  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [researchFocus, setResearchFocus] = useState("");
  const [newSignalType, setNewSignalType] = useState("");
  const [newWeight, setNewWeight] = useState("1.5");

  function openEditor() {
    setWeights(profile?.signal_weights ?? {});
    setResearchFocus(profile?.research_focus ?? "");
    setOpen(true);
  }

  function addWeight() {
    const weight = Number.parseFloat(newWeight);
    if (!newSignalType || Number.isNaN(weight) || weight < 0 || weight > 5) return;
    setWeights((prev) => ({ ...prev, [newSignalType]: weight }));
    setNewSignalType("");
    setNewWeight("1.5");
  }

  function removeWeight(key: string) {
    setWeights((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSave() {
    try {
      await setProfile.mutateAsync({ signal_weights: weights, research_focus: researchFocus || null });
      toast.success(t("saved"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveError"));
    }
  }

  const availableTypes = (Object.keys(signalLabels) as SignalType[]).filter((k) => !(k in weights));
  const currentWeights = profile?.signal_weights ?? {};

  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{team.name}</p>
          {!isLoading && !open && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {Object.entries(currentWeights).length > 0 ? (
                Object.entries(currentWeights).map(([key, weight]) => (
                  <Badge key={key} variant="outline">
                    {signalLabels[key as SignalType] ?? key} ×{weight}
                  </Badge>
                ))
              ) : (
                <p className="bee-caption">{t("noWeights")}</p>
              )}
            </div>
          )}
        </div>
        {!open && (
          <button type="button" onClick={openEditor} className="bee-btn-ghost shrink-0 text-xs">
            {t("configure")}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("weightsLabel")}</label>
            <p className="bee-caption mb-2">{t("weightsHint")}</p>
            {Object.keys(weights).length > 0 && (
              <div className="mb-2 space-y-1.5">
                {Object.entries(weights).map(([key, weight]) => (
                  <div key={key} className="bee-inset flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="text-sm">
                      {signalLabels[key as SignalType] ?? key} <span className="text-muted-foreground">×{weight}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeWeight(key)}
                      className="bee-micro text-muted-foreground hover:text-foreground"
                    >
                      {t("remove")}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <select
                value={newSignalType}
                onChange={(e) => setNewSignalType(e.target.value)}
                className="bee-input flex-1"
              >
                <option value="">{t("selectSignalType")}</option>
                {availableTypes.map((key) => (
                  <option key={key} value={key}>
                    {signalLabels[key]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="bee-input w-20"
              />
              <button type="button" onClick={addWeight} disabled={!newSignalType} className="bee-btn-ghost text-xs">
                {t("add")}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("researchFocusLabel")}</label>
            <textarea
              value={researchFocus}
              onChange={(e) => setResearchFocus(e.target.value)}
              placeholder={t("researchFocusPlaceholder")}
              rows={2}
              className="bee-input resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={setProfile.isPending}
              className="bee-btn bee-btn--primary"
            >
              {setProfile.isPending ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="bee-btn-ghost">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Per-team signal weighting + research focus — biases /priority/today's
 * ranking and AccountResearchAgent's synthesis for whoever's on that team.
 * OWNER/ADMIN only, same gate as CreateTeamForm; hidden entirely when there
 * are no teams yet (nothing to configure). */
export function TeamProfilesSection({ teams, canManage }: { teams: TeamOut[]; canManage: boolean }) {
  const t = useTranslations("workspace.team.teamProfiles");

  if (!canManage || teams.length === 0) return null;

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-4">
      <div>
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <h2 className="mt-1 text-base font-semibold">{t("title")}</h2>
        <p className="bee-caption mt-1">{t("subtitle")}</p>
      </div>
      <div className="space-y-3">
        {teams.map((team) => (
          <TeamProfileEditor key={team.id} team={team} />
        ))}
      </div>
    </section>
  );
}
