"use client";

import { EngagementInboxPanel } from "@/components/engagement-inbox";
import { WorkflowStatusPanel } from "@/components/workflow-status";

/** Secuencias — estado de DynamicSequence y bandeja de engagement entrante. */
export function SequencesView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Dynamic Sequence · Smart Engagement</p>
        <div className="mt-1">
          <h1 className="bee-display">Secuencias</h1>
          <p className="bee-caption mt-1">
            Cadencias multicanal en curso y eventos entrantes que requieren respuesta
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <WorkflowStatusPanel />
        <EngagementInboxPanel />
      </div>
    </div>
  );
}
