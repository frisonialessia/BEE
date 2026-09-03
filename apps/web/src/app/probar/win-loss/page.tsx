import { redirect } from "next/navigation";

// See dashboard/win-loss/page.tsx's own comment.
export default function ProbarWinLossRedirectPage() {
  redirect("/probar/forecast?tab=winloss");
}
