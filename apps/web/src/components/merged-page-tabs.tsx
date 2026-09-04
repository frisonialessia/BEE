"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * A page with tabs. The active tab lives in `?tab=`, not just component
 * state — a bookmark to an old standalone route 301s here with that param
 * set, so it still lands on the right tab. `defaultValue`'s own tab omits
 * the param, keeping the canonical URL clean.
 *
 * BEE standard: the page header (eyebrow · title · caption) and the tab
 * strip share ONE row — header left, tabs + actions right — so the KPI
 * strip below (`belowTabs`) starts at the same height as on a page without
 * tabs. `actionsByTab` is for a control that belongs to one tab only.
 */
export function MergedPageTabs({
  tabs,
  defaultValue,
  header,
  actions,
  actionsByTab,
  belowTabs,
}: {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  defaultValue: string;
  header?: React.ReactNode;
  actions?: React.ReactNode;
  actionsByTab?: Partial<Record<string, React.ReactNode>>;
  /** Shared block under the tabs row and above every tab's content — the
   *  page's KPI strip, so it starts at the standard height on every tab. */
  belowTabs?: React.ReactNode;
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
    <Tabs value={value} onValueChange={handleChange} className="bee-page gap-0">
      <div className="bee-page-head">
        {header}
        <div className="bee-page-head__side">
          <TabsList className="bee-tabs">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="bee-tabs__tab">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {(actionsByTab?.[value] || actions) && (
            <div className="bee-page-head__actions">
              {actionsByTab?.[value]}
              {actions}
            </div>
          )}
        </div>
      </div>
      {belowTabs && <div className="bee-page__kpis">{belowTabs}</div>}
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="bee-page__body">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
