"use client";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { SiteHeader } from "@/components/site-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bee-control flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <DashboardNav />
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
