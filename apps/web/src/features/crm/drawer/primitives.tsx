"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

import { mix } from "@/components/charts/palette";
import { cn } from "@/lib/utils";

import { PRIORITY_STEPS, priorityOf } from "./priority";

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Initials in a quiet lavender disc — ink on the app's one highlight
 *  surface, never a stage tint. */
export function Avatar({
  name,
  size = 40,
  photoUrl,
  className,
}: {
  name: string | null | undefined;
  size?: number;
  photoUrl?: string | null;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- client-resized data: URI, not an optimizable remote asset
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full bg-[var(--color-primary)] font-bold text-[var(--color-text)]", className)}
      style={{ width: size, height: size, fontSize: size >= 40 ? 13 : size >= 28 ? 12 : 9 }}
    >
      {initials(name)}
    </span>
  );
}

/** Small icon disc — the row marker in timeline items. Neutral grey, ink glyph. */
export function IconDisc({ icon: Icon, size = 28 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: mix("var(--color-text)", 6) }}
    >
      <Icon className="size-3.5 stroke-[1.5] text-[var(--color-text)]" />
    </span>
  );
}

/** Tag chip — a small pure-token accent (honey for a hot lead, lavender
 *  for a type or status); never a wash over a section. */
export function Chip({ hue, children }: { hue: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium text-[var(--color-text)]"
      style={{ background: hue }}
    >
      {children}
    </span>
  );
}

/** Name pill — avatar + name on white with a hairline (the owner in view mode). */
export function PersonPill({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--color-divider)] bg-[var(--color-card)] py-0.5 pl-0.5 pr-2.5 text-sm">
      <Avatar name={name} size={20} photoUrl={photoUrl} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Hairline-divided section of a pane. */
export function PaneSection({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-[var(--color-divider)] pt-4 first:border-t-0 first:pt-0", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="bee-card-title !mb-0">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Label / value row with a hairline under it — the view mode's fact list. */
export function FactRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-[var(--color-divider)] py-2 last:border-b-0", className)}>
      <dt className="bee-caption">{label}</dt>
      <dd className="min-w-0 truncate text-sm">{children}</dd>
    </div>
  );
}

/** Label over control — the calendar dialog's field: caption label, grey
 *  filled `bee-input` below. Wrapping <label> so the caption names the
 *  control for assistive tech without an id per field. */
export function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="bee-caption">
        {label}
        {required && " *"}
      </span>
      {children}
      {hint && <span className="bee-micro">{hint}</span>}
    </label>
  );
}

/** Toggle pill — the dialog's "Invitar a tu equipo" chip. The fill it
 *  takes when pressed is the caller's (a stage hue, lavender for a person)
 *  and animates in (see .bee-drawer-pill). */
export function Pill({
  pressed,
  fill,
  disabled,
  title,
  onClick,
  children,
}: {
  pressed: boolean;
  fill?: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="bee-btn-ghost bee-drawer-pill text-xs"
      style={{ "--bee-pill-fill": fill ?? "var(--color-primary)" } as CSSProperties}
    >
      {children}
    </button>
  );
}

/**
 * Priority as the dialog's color-dot row: three dots (lavender · honey ·
 * magenta), a ring on the chosen one. Read-only when `onChange` is absent.
 */
export function PriorityDots({ score, onChange, size = 24 }: { score: number; onChange?: (score: number) => void; size?: number }) {
  const t = useTranslations("crm.form");
  const current = priorityOf(score);
  return (
    <div role={onChange ? "group" : "img"} aria-label={onChange ? t("priority") : `${t("priority")}: ${t(`priorityLevels.${current.key}`)}`} className="flex items-center gap-2">
      {PRIORITY_STEPS.map((step) => {
        const active = step.key === current.key;
        const cls = cn("bee-drawer-dot rounded-full border-2", active ? "scale-110 border-[var(--color-text)]" : "border-transparent");
        const style = { width: size, height: size, background: step.color };
        return onChange ? (
          <button
            key={step.key}
            type="button"
            aria-pressed={active}
            aria-label={t(`priorityLevels.${step.key}`)}
            title={t(`priorityLevels.${step.key}`)}
            onClick={() => onChange(step.score)}
            className={cls}
            style={style}
          />
        ) : (
          <span key={step.key} aria-hidden className={cls} style={style} />
        );
      })}
    </div>
  );
}
