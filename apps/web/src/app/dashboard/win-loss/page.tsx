import { redirect } from "next/navigation";

// Win/Loss merged into Forecast as a second tab — see forecast-view.tsx's
// own docstring for why. Keeps this route alive as a redirect so no old
// link/bookmark to it breaks.
export default function WinLossRedirectPage() {
  redirect("/dashboard/forecast?tab=winloss");
}
