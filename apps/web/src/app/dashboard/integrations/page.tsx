import { redirect } from "next/navigation";

/** Integraciones lives inside Control (tab Conexiones) now; old links land there. */
export default function IntegrationsRedirectPage() {
  redirect("/dashboard/control?tab=connections");
}
