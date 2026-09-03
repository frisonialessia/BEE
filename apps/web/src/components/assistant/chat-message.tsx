import { PencilLine, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AssistantMessage } from "@/features/assistant/use-assistant-chat";
import { cn } from "@/lib/utils";

/** The copilot's audit trail: which tools it consulted or changed before
 *  answering — small, under the bubble, never inside the answer text. */
function ToolTrace({ calls }: { calls: NonNullable<AssistantMessage["toolCalls"]> }) {
  const t = useTranslations("workspace.assistant.tools");
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {calls.map((call, i) => {
        const Icon = call.mutates ? PencilLine : Search;
        const label = t.has(`names.${call.name}`) ? t(`names.${call.name}`) : call.name;
        return (
          <li
            key={`${call.name}-${i}`}
            className={cn(
              "bee-chip inline-flex items-center gap-1 text-xs",
              call.mutates ? "bee-outline--warm" : "bee-outline--blue",
            )}
            title={call.summary}
          >
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

export function ChatMessage({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <span className="bee-assistant-gradient mt-1 flex size-[17px] shrink-0 items-center justify-center rounded-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, mismo asset que el FAB (ask-bee-fab.tsx) */}
          <img src="/assistant-bee.svg" alt="" className="size-2.5" aria-hidden="true" />
        </span>
      )}
      <div className="flex max-w-[80%] flex-col">
        <div
          className={cn(
            "whitespace-pre-line rounded-[var(--radius-lg)] px-4 py-3 text-sm leading-relaxed",
            isUser ? "bg-[var(--color-cta)] text-white" : "bg-[var(--color-card)] text-foreground",
          )}
        >
          {message.text}
        </div>
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && <ToolTrace calls={message.toolCalls} />}
      </div>
    </div>
  );
}
