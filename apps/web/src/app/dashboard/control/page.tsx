"use client";

import {
  ControlLayout,
  LeadWorkspace,
  SignalHexMap,
  SignalStream,
  SystemHealth,
} from "@/features/control";

/** BEE Control — CRM operator workspace. */
export default function ControlPage() {
  return (
    <ControlLayout
      header={
        <>
          <h1 className="bee-display">Control</h1>
          <p className="bee-caption mt-1">
            Action zone · Kanban left · Intelligence right
          </p>
        </>
      }
      workspace={<LeadWorkspace />}
      health={<SystemHealth />}
      intelligence={
        <>
          <SignalHexMap height={280} maxLeads={200} className="h-full" />
          <SignalStream />
        </>
      }
    />
  );
}
