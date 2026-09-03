import { redirect } from "next/navigation";

// See dashboard/opportunities/page.tsx's own comment.
export default function ProbarOpportunitiesRedirectPage() {
  redirect("/probar/crm?tab=opportunities");
}
