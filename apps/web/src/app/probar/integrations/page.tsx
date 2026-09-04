import { redirect } from "next/navigation";

/** Integraciones lives inside Control (tab Conexiones) now; old links land there. */
export default function IntegrationsRedirectPage() {
  redirect("/probar/control?tab=connections");
}
