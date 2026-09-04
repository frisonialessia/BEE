"use client";

import Link from "next/link";
import type { ComponentProps, PointerEvent } from "react";

import { cn } from "@/lib/utils";
import { isFinePointer, prefersReducedMotion } from "@/components/marketing-motion";

/**
 * MagneticLink — a primary CTA that leans up to 4px toward the pointer
 * and casts a honey glow that follows it (see .bee-magnetic in
 * globals.css: the lean is a transform from --mx/--my, the glow a
 * pointer-anchored radial highlight + an offset honey shadow). Mouse-class
 * pointers only — `isFinePointer()` plus the event's pointerType — so a
 * touch tap never moves the button under the finger; and nothing at all
 * under prefers-reduced-motion. Without JS it is a plain .bee-btn.
 */
export function MagneticLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== "mouse" || !isFinePointer() || prefersReducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width; // 0..1 across the button
    const ny = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", ((nx - 0.5) * 2).toFixed(3));
    el.style.setProperty("--my", ((ny - 0.5) * 2).toFixed(3));
    el.style.setProperty("--gx", `${Math.round(nx * 100)}%`);
    el.style.setProperty("--gy", `${Math.round(ny * 100)}%`);
  };
  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--mx", "0");
    el.style.setProperty("--my", "0");
  };

  return (
    <Link {...props} className={cn("bee-magnetic", className)} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </Link>
  );
}
