"use client";

import { LeadWorkspace, SignalStream, SystemHealth } from "@/features/control";

/**
 * BEE Control — primary operator interface.
 *
 * Layout: SystemHealth (top) · SignalStream (left) · LeadWorkspace (main)
 */
export default function ControlPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-light tracking-tight">Control</h1>
        <p className="mt-2 max-w-xl text-sm font-light text-muted-foreground">
          Monitor ingestion health, signal flow, and lead strategies — updated automatically.
        </p>
      </header>

      <SystemHealth />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <SignalStream />
        <LeadWorkspace />
      </div>
    </div>
  );
}
