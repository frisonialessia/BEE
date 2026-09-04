"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DATA, mix } from "@/components/charts/palette";
import { SIGNALS, SignalList } from "@/components/marketing-demo-panel";
import { MarketingHoneycomb } from "@/components/marketing-honeycomb";

/**
 * FeatureVisual — the product card on one side of each feature row on the
 * landing (src/app/page.tsx). Three ids, one visual each:
 *
 *   signal  → the signal rows next to the hive: what BEE detects.
 *   play    → one play card: headline, argument, channel chip, and the
 *             Aprobar / Rechazar pair — the visitor can click them; the
 *             card answers, and "Deshacer" brings the play back.
 *   execute → the week strip with the scheduled steps and the next-step
 *             list — what happens once a play is approved.
 *
 * One client component for the three because the play card keeps state
 * and the hive is interactive; the server page only passes the id. Copy
 * lives in landing.features.*. Color: ink for text and icons, honey chips
 * on the signal rows, lilac blocks on the calendar — one hue per box; the
 * only blue is the primary button, as everywhere on the landing.
 */

export type FeatureVisualId = "signal" | "play" | "execute";

function SignalVisual() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <SignalList rows={SIGNALS.slice(0, 4)} compact />
      <div className="mx-auto h-36 w-36 sm:h-40 sm:w-40">
        <MarketingHoneycomb />
      </div>
    </div>
  );
}

type PlayState = "open" | "approved" | "rejected";

function PlayVisual() {
  const t = useTranslations("landing.features.play.card");
  const [state, setState] = useState<PlayState>("open");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <p className="mt-1 text-sm font-semibold">{t("headline")}</p>
        </div>
        <span className="bee-micro shrink-0">{t("time")}</span>
      </div>
      <p className="bee-caption text-sm leading-relaxed">{t("argument")}</p>
      <div className="flex flex-wrap gap-1.5">
        {(["channel", "timing", "fit"] as const).map((k) => (
          <span key={k} className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium text-[var(--color-text)]" style={{ background: mix(DATA.honeyFill, 28) }}>
            {t(`chips.${k}`)}
          </span>
        ))}
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-4">
        {state === "open" ? (
          <>
            <button type="button" onClick={() => setState("approved")} className="bee-btn bee-btn--primary">
              <Check className="size-4" /> {t("approve")}
            </button>
            <button type="button" onClick={() => setState("rejected")} className="bee-btn-ghost">
              <X className="size-4" /> {t("reject")}
            </button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              {state === "approved" ? <Check className="size-4" strokeWidth={2.5} /> : <X className="size-4" strokeWidth={2.5} />}
              {t(state === "approved" ? "approvedNote" : "rejectedNote")}
            </span>
            <button type="button" onClick={() => setState("open")} className="bee-btn-text text-sm">
              {t("undo")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const DAYS = ["d1", "d2", "d3", "d4", "d5"] as const;
// Day index → the step scheduled there (lilac block), if any.
const SCHEDULED: Partial<Record<(typeof DAYS)[number], { id: "email" | "call" | "followup"; strength: number }>> = {
  d2: { id: "email", strength: 100 },
  d4: { id: "call", strength: 65 },
  d5: { id: "followup", strength: 40 },
};
const STEPS = [
  { id: "email", done: true },
  { id: "call", done: false },
  { id: "followup", done: false },
] as const;

function ExecuteVisual() {
  const t = useTranslations("landing.features.execute.card");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <span className="bee-micro">{t("week")}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {DAYS.map((d, i) => {
          const block = SCHEDULED[d];
          return (
            <div key={d} className={`flex min-h-20 flex-col gap-1.5 rounded-[var(--radius-md)] border p-1.5 ${i === 1 ? "border-[var(--color-text)]/40" : "border-[var(--color-divider)]"}`}>
              <p className="bee-micro text-center">{t(`days.${d}`)}</p>
              {block && (
                <div className="rounded-[4px] px-1.5 py-1 text-micro font-medium leading-tight text-[var(--color-text)]" style={{ background: mix(DATA.violet, block.strength * 0.4) }}>
                  {t(`steps.${block.id}`)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ul className="divide-y divide-[var(--color-divider)] border-t border-[var(--color-divider)]">
        {STEPS.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
            <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${s.done ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-card)]" : "border-[var(--color-text-muted)]"}`} aria-hidden>
              {s.done && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className={`flex-1 ${s.done ? "text-[var(--color-text-muted)] line-through" : ""}`}>{t(`steps.${s.id}`)}</span>
            <span className="bee-micro">{t(`when.${s.id}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FeatureVisual({ id }: { id: FeatureVisualId }) {
  switch (id) {
    case "signal":
      return <SignalVisual />;
    case "play":
      return <PlayVisual />;
    case "execute":
      return <ExecuteVisual />;
  }
}
