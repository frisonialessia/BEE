"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { mix } from "@/components/charts/palette";

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Initials in a disc tinted with the block hue. */
export function Avatar({
  name,
  hue,
  size = 40,
  photoUrl,
  className,
}: {
  name: string | null | undefined;
  hue: string;
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
      className={cn("grid shrink-0 place-items-center rounded-full font-bold text-[var(--color-text)]", className)}
      style={{ width: size, height: size, background: mix(hue, 20), fontSize: size >= 40 ? 13 : 12 }}
    >
      {initials(name)}
    </span>
  );
}

/** Small icon disc — the row marker in contact rows and timeline items. */
export function IconDisc({ icon: Icon, hue, size = 28 }: { icon: LucideIcon; hue: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: mix(hue, 20) }}
    >
      <Icon className="size-3.5 stroke-[1.5] text-[var(--color-text)]" />
    </span>
  );
}

/** Label-over-value row with an icon disc: Email · Teléfono · LinkedIn. */
export function InfoRow({
  icon,
  hue,
  label,
  children,
}: {
  icon: LucideIcon;
  hue: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconDisc icon={icon} hue={hue} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="bee-caption">{label}</p>
        <div className="truncate text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Tag chip — a small pure-token accent (honey for a hot lead, lilac for
 *  a type or status, mint for a client); never a wash of the block hue. */
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
