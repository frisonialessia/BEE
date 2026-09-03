import { redirect } from "next/navigation";

// Leads merged into Companies as a second tab — see companies-list.tsx's
// own docstring for why. Keeps this route alive as a redirect so no old
// link/bookmark to it breaks.
export default function LeadsRedirectPage() {
  redirect("/dashboard/companies?tab=leads");
}
