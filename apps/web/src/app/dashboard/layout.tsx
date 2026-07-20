import { DashboardRail } from "@/components/dashboard/dashboard-rail";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bee-app">
      <DashboardRail />
      <div className="bee-main">{children}</div>
    </div>
  );
}
