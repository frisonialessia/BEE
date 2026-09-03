import { redirect } from "next/navigation";

// See dashboard/priority/page.tsx's own comment.
export default function ProbarPriorityRedirectPage() {
  redirect("/probar/signals?tab=priority");
}
