import { redirect } from "next/navigation";

// Resilience merged into Control as a second tab — see
// dashboard/control/page.tsx's own docstring for why. Keeps this route
// alive as a redirect so no old link/bookmark to it breaks.
export default function ResilienceRedirectPage() {
  redirect("/dashboard/control?tab=resilience");
}
