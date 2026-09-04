import { redirect } from "next/navigation";

// See dashboard/dark-funnel/page.tsx's own comment.
export default function ProbarDarkFunnelRedirectPage() {
  redirect("/probar/signals?tab=intent");
}
