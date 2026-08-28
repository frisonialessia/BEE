"use client";

import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CompanyProfileStep } from "@/features/onboarding/company-profile-step";
import { useOnboarding } from "@/features/onboarding/onboarding-context";
import { OnboardingTourStep } from "@/features/onboarding/onboarding-tour-step";
import { TeamSetupStep } from "@/features/onboarding/team-setup-step";
import { useOrganizationProfile } from "@/hooks/queries/use-organization-profile";
import { useTeams } from "@/hooks/queries/use-teams";
import { useAuth } from "@/providers/auth-provider";

/** Three steps, in order, each skippable on its own — not a single
 * pick-one screen, since profile/team/tour are independent pieces of
 * setup someone might do all, some, or none of:
 *
 * 1. Company profile (OWNER/ADMIN, only while employee_range is unset) —
 *    an account field, "tell us about your company."
 * 2. Team setup (OWNER/ADMIN, only while the org has zero teams) — a real
 *    action (POST /teams), not a profile field. Deliberately a separate
 *    step from #1 so the two don't get conflated — one describes the
 *    account, the other structures who reports to whom.
 * 3. The guided tour — everyone gets this one, always last.
 *
 * A MEMBER (can't set either #1 or #2) skips straight to #3 — nothing to
 * ask them, asking anyway would just be noise on their first visit. */
export function OnboardingIntro() {
  const { isOpen, closeIntro } = useOnboarding();
  const { user } = useAuth();
  const { data: profileResult, isLoading: profileLoading } = useOrganizationProfile();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const [profileStepDone, setProfileStepDone] = useState(false);
  const [teamStepDone, setTeamStepDone] = useState(false);

  const canSetUpOrg = user?.role === "owner" || user?.role === "admin";
  const profileIncomplete = !profileLoading && !profileResult?.data.employee_range;
  const noTeamsYet = !teamsLoading && (teams?.length ?? 0) === 0;

  const showProfileStep = canSetUpOrg && profileIncomplete && !profileStepDone;
  const showTeamStep = !showProfileStep && canSetUpOrg && noTeamsYet && !teamStepDone;

  let step: React.ReactNode;
  if (showProfileStep) {
    step = <CompanyProfileStep onDone={() => setProfileStepDone(true)} />;
  } else if (showTeamStep) {
    step = <TeamSetupStep onDone={() => setTeamStepDone(true)} />;
  } else {
    step = <OnboardingTourStep onDone={closeIntro} />;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeIntro()}>
      <DialogContent className="max-w-xl">{step}</DialogContent>
    </Dialog>
  );
}
