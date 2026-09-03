import { redirect } from "next/navigation";

// See dashboard/leads/page.tsx's own comment.
export default function ProbarLeadsRedirectPage() {
  redirect("/probar/companies?tab=leads");
}
