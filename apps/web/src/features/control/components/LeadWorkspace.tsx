/**
 * LeadWorkspace — Kanban for leads with BEE-generated closing strategies.
 *
 * @status Stub — wired in phase 2 after SystemHealth validation.
 */
export function LeadWorkspace() {
  return (
    <section className="bee-surface min-h-[480px] p-8" aria-label="Lead workspace">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Lead Workspace
      </h2>
      <p className="mt-6 text-sm font-light text-muted-foreground">
        Kanban columns: Detected → Enriching → Ready → In Progress → Closed
      </p>
    </section>
  );
}
