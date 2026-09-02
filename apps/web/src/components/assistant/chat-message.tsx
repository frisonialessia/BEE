import { cn } from "@/lib/utils";
import type { AssistantMessage } from "@/features/assistant/use-assistant-chat";

export function ChatMessage({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
      {!isUser && (
        <span className="bee-assistant-gradient mt-0.5 flex size-[17px] shrink-0 items-center justify-center rounded-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, mismo asset que el FAB (ask-bee-fab.tsx) */}
          <img src="/assistant-bee.svg" alt="" className="size-2.5" aria-hidden="true" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-line rounded-[var(--radius-lg)] px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-[var(--color-cta)] text-white"
            : "bg-[var(--color-card)] text-foreground",
        )}
      >
        {message.text}
      </div>
    </div>
  );
}
