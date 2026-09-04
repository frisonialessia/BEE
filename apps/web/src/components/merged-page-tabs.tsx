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
/** BEE standard: on a tabbed page the page header (eyebrow · title · caption)
 * and the tab strip share ONE row — header left, tabs + actions right — so
 * the KPI strip below starts at exactly the same height as on a page
 * without tabs (and as on Resumen). `actionsByTab` is for a control that
 * belongs to one tab only (an export button), `actions` for the page-wide
 * ones (live badge, primary button). */
export function MergedPageTabs({
  tabs,
  defaultValue,
  header,
  actions,
  actionsByTab,
}: {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  defaultValue: string;
  header?: React.ReactNode;
  actions?: React.ReactNode;
  actionsByTab?: Partial<Record<string, React.ReactNode>>;
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
    <Tabs value={value} onValueChange={handleChange} className="gap-0">
      <div className={header ? "mb-4 flex flex-wrap items-end justify-between gap-4" : "mb-4 flex flex-wrap items-center justify-between gap-2"}>
        {header}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <TabsList className="h-auto max-w-full flex-wrap border border-border bg-background group-data-[orientation=horizontal]/tabs:h-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="rounded-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {actionsByTab?.[value]}
          {actions}
        </div>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
