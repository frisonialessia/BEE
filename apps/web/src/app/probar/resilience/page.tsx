import { redirect } from "next/navigation";

// See dashboard/resilience/page.tsx's own comment.
export default function ProbarResilienceRedirectPage() {
  redirect("/probar/control?tab=resilience");
}
