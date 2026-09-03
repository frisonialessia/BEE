"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Shared tab mechanics for a page that used to be two separate sidebar
 * entries (see lib/nav-items.ts — several pairs were merged into one page
 * with tabs to cut sidebar sprawl, e.g. CRM+Oportunidades, Forecast+Win/Loss).
 * The active tab lives in `?tab=`, not just component state — the old
 * standalone route now 301s here with that param set (see the old page's
 * page.tsx), so a bookmark/link to it still lands on the right tab instead
 * of always defaulting to the first one. `defaultValue`'s own tab omits the
 * param entirely, keeping the canonical URL clean. */
export function MergedPageTabs({
  tabs,
  defaultValue,
}: {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const value = tabs.some((t) => t.value === tabParam) ? (tabParam as string) : defaultValue;

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Tabs value={value} onValueChange={handleChange}>
      <TabsList className="mb-4 border border-border bg-background">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="rounded-sm">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
