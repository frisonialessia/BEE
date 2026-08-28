"use client";

import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CompanyProfileStep } from "@/features/onboarding/company-profile-step";
import { useOnboarding } from "@/features/onboarding/onboarding-context";
import { OnboardingTourStep } from "@/features/onboarding/onboarding-tour-step";
import { useOrganizationProfile } from "@/hooks/queries/use-organization-profile";
import { useAuth } from "@/providers/auth-provider";

/** Two steps, shown at most once each per browser (see OnboardingProvider):
 * 1. Company profile (OWNER/ADMIN only, only while employee_range is still
 *    unset) — a member can't set it anyway, and asking twice is just noise.
 * 2. The guided tour — everyone gets this one.
 * Skips straight to the tour while the profile is loading, already set, or
 * the visitor isn't OWNER/ADMIN — never blocks the tour on this. */
export function OnboardingIntro() {
  const { isOpen, closeIntro } = useOnboarding();
  const { user } = useAuth();
  const { data: profileResult, isLoading: profileLoading } = useOrganizationProfile();
  const [profileStepDone, setProfileStepDone] = useState(false);

  const canSetProfile = user?.role === "owner" || user?.role === "admin";
  const profileIncomplete = !profileLoading && !profileResult?.data.employee_range;
  const showProfileStep = canSetProfile && profileIncomplete && !profileStepDone;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeIntro()}>
      <DialogContent className="max-w-xl">
        {showProfileStep ? (
          <CompanyProfileStep onDone={() => setProfileStepDone(true)} />
        ) : (
          <OnboardingTourStep onDone={closeIntro} />
        )}
      </DialogContent>
    </Dialog>
  );
}
