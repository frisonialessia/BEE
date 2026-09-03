import { redirect } from "next/navigation";

// Priority merged into Signals as a second tab — see
// signals-dashboard.tsx's own docstring for why. Keeps this route alive
// as a redirect so no old link/bookmark to it breaks.
export default function PriorityRedirectPage() {
  redirect("/dashboard/signals?tab=priority");
}
