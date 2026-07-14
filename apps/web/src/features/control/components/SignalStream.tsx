/**
 * SignalStream — lateral feed: Webhook → Enrichment → Strategy.
 *
 * @status Stub — wired in phase 2 after SystemHealth validation.
 */
export function SignalStream() {
  return (
    <aside
      className="bee-surface flex h-full min-h-[320px] flex-col p-6"
      aria-label="Signal stream"
    >
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Signal Stream
      </h2>
      <p className="mt-6 flex-1 text-sm font-light text-muted-foreground">
        Pipeline events will appear here as webhooks are ingested and enriched.
      </p>
    </aside>
  );
}
