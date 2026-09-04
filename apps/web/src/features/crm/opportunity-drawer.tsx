"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { CreateOpportunityPanes } from "@/features/crm/drawer/create-panes";
import { OpportunityViewPanes } from "@/features/crm/drawer/view-panes";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The CRM side panel — BEE's working surface. One shell, two modes:
 *
 *  - view: an opportunity in two panes (contact + account on the left,
 *    pipeline + activity on the right) — see drawer/view-panes.tsx;
 *  - create: the same panel, empty, with the new-opportunity form laid
 *    out in the same two panes — see drawer/create-panes.tsx. Replaces the
 *    centered "Nueva oportunidad" dialog everywhere.
 *
 * ~80% of the viewport on desktop, full-screen on phones. Esc closes;
 * Tab is trapped inside; focus returns to whatever opened it.
 */
export function OpportunityDrawer() {
  const t = useTranslations("crm.drawer");
  const { mode, opportunityId, initialTab, createPreset, closeOpportunity } = useOpportunityDrawer();
  const asideRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const open = mode !== null;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => {
      const aside = asideRef.current;
      if (!aside) return;
      if (!aside.contains(document.activeElement)) {
        (aside.querySelector<HTMLElement>(FOCUSABLE) ?? aside).focus();
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOpportunity();
        return;
      }
      if (e.key !== "Tab" || !asideRef.current) return;
      const nodes = Array.from(asideRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!asideRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, closeOpportunity]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="bee-drawer-overlay" aria-label={t("closeOverlay")} onClick={closeOpportunity} />
      <aside
        ref={asideRef}
        tabIndex={-1}
        className="bee-drawer bee-drawer--wide outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? t("newTitle") : t("dialogLabel")}
      >
        {mode === "create" ? (
          <CreateOpportunityPanes key="create" preset={createPreset} />
        ) : (
          <OpportunityViewPanes key={opportunityId} opportunityId={opportunityId!} initialTab={initialTab} />
        )}
      </aside>
    </>
  );
}
