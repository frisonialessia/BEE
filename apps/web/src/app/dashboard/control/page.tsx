"use client";

import {
  ControlLayout,
  LeadWorkspace,
  SignalHexMap,
  SignalStream,
  SystemHealth,
} from "@/features/control";

/**
 * BEE Control — primary operator interface.
 * High-fidelity editorial layout: health → hex hero → stream/workspace.
 */
export default function ControlPage() {
  return (
    <ControlLayout
      header={
        <>
          <p className="bee-eyebrow">Task Schedule</p>
          <h1 className="bee-display mt-2">Control</h1>
          <p className="bee-caption mt-3 max-w-xl">
            Monitor ingestion health, signal flow, and lead strategies — updated automatically.
          </p>
        </>
      }
      health={<SystemHealth />}
      hero={<SignalHexMap height={360} maxLeads={200} className="bee-surface--hero h-full" />}
      stream={<SignalStream />}
      workspace={<LeadWorkspace />}
    />
  );
}
