import { redirect } from "next/navigation";

// Dark Funnel merged into Señales as the "Intención" tab — the hive and the
// intent feed come from the same signal source as the feed itself (see
// components/dark-funnel-dashboard.tsx's DarkFunnelTab). Keeps this route
// alive as a redirect so no old link/bookmark to it breaks.
export default function DarkFunnelRedirectPage() {
  redirect("/dashboard/signals?tab=intent");
}
