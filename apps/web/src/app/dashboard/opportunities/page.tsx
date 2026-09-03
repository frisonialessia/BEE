import { redirect } from "next/navigation";

// Opportunities merged into CRM as a second tab — see crm-view.tsx's own
// docstring for why. Keeps this route alive as a redirect so no old
// link/bookmark to it breaks.
export default function OpportunitiesRedirectPage() {
  redirect("/dashboard/crm?tab=opportunities");
}
