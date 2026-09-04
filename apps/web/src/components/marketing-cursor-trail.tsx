"use client";

import { useEffect, useRef } from "react";

import { isFinePointer, prefersReducedMotion } from "@/components/marketing-motion";

/**
 * MarketingCursorTrail — faint white/honey dots spawned along the pointer
 * path over the hero; each drifts toward the nearest floating signal card
 * and fades, echoing "BEE catches what moves". A <canvas> covering the
 * hero section (its parent), so the whole thing is one draw call per
 * frame and zero DOM churn.
 *
 * Budget: a fixed pool of 24 particles in typed arrays — nothing is
 * allocated per frame or per spawn (a dead slot is reused, or the oldest
 * is recycled). The rAF loop runs only while a particle is alive and
 * stops on its own. Jitter comes from a tiny LCG, not Math.random(), so
 * the trail is deterministic for a given pointer path. Mouse-class
 * pointers only, xl+ only (where the signal cards exist — the canvas is
 * display:none below that and the handler checks it), and nothing under
 * prefers-reduced-motion. Renders an empty canvas on the server.
 */

const POOL = 24;
const LIFE_STEP = 1 / 42; // ≈0.7 s at 60 fps
const SPAWN_DISTANCE = 18; // px of pointer travel between spawns

export function MarketingCursorTrail() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || prefersReducedMotion() || !isFinePointer()) return;
    const field = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!field || !ctx) return;

    // Palette read from the tokens (never a literal hex here); white is the
    // sparkle colour the landing already uses.
    const honey = getComputedStyle(document.documentElement).getPropertyValue("--color-chart-3").trim() || "#ffffff";

    const px = new Float32Array(POOL);
    const py = new Float32Array(POOL);
    const vx = new Float32Array(POOL);
    const vy = new Float32Array(POOL);
    const tx = new Float32Array(POOL);
    const ty = new Float32Array(POOL);
    const life = new Float32Array(POOL); // 0 = dead
    const honeyTint = new Uint8Array(POOL);
    let seed = 7;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    let width = 0;
    let height = 0;
    let raf = 0;
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    // Card centres (field-relative), refreshed on each spawn — four
    // elements, cheap, and they float/parallax so a cache would drift.
    const cards = field.querySelectorAll<HTMLElement>(".bee-hero-signal__float");

    const resize = () => {
      const r = field.getBoundingClientRect();
      width = r.width;
      height = r.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const step = () => {
      raf = 0;
      ctx.clearRect(0, 0, width, height);
      let alive = 0;
      for (let i = 0; i < POOL; i++) {
        if (life[i] <= 0) continue;
        const dx = tx[i] - px[i];
        const dy = ty[i] - py[i];
        const dist = Math.hypot(dx, dy) || 1;
        vx[i] = (vx[i] + (dx / dist) * 0.55) * 0.9;
        vy[i] = (vy[i] + (dy / dist) * 0.55) * 0.9;
        px[i] += vx[i];
        py[i] += vy[i];
        life[i] -= LIFE_STEP;
        if (life[i] <= 0) continue;
        alive++;
        const a = life[i];
        ctx.globalAlpha = a * (honeyTint[i] ? 0.55 : 0.8);
        ctx.fillStyle = honeyTint[i] ? honey : "#ffffff";
        ctx.beginPath();
        ctx.arc(px[i], py[i], 1 + a * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (alive > 0) raf = requestAnimationFrame(step);
    };

    const spawn = (x: number, y: number) => {
      // Reuse a dead slot, else recycle the oldest.
      let slot = -1;
      let oldest = 2;
      for (let i = 0; i < POOL; i++) {
        if (life[i] <= 0) {
          slot = i;
          break;
        }
        if (life[i] < oldest) {
          oldest = life[i];
          slot = i;
        }
      }
      // Nearest signal card (field-relative centres).
      const fr = field.getBoundingClientRect();
      let best = Number.POSITIVE_INFINITY;
      let bx = x;
      let by = y - 40;
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const cx = r.left - fr.left + r.width / 2;
        const cy = r.top - fr.top + r.height / 2;
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < best) {
          best = d;
          bx = cx;
          by = cy;
        }
      });
      px[slot] = x + (rnd() - 0.5) * 6;
      py[slot] = y + (rnd() - 0.5) * 6;
      vx[slot] = (rnd() - 0.5) * 1.2;
      vy[slot] = (rnd() - 0.5) * 1.2;
      tx[slot] = bx;
      ty[slot] = by;
      life[slot] = 1;
      honeyTint[slot] = rnd() < 0.35 ? 1 : 0;
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || getComputedStyle(canvas).display === "none") return;
      const fr = field.getBoundingClientRect();
      const x = e.clientX - fr.left;
      const y = e.clientY - fr.top;
      if (Number.isNaN(lastX) || Math.hypot(x - lastX, y - lastY) >= SPAWN_DISTANCE) {
        lastX = x;
        lastY = y;
        spawn(x, y);
      }
    };

    field.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      field.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="bee-trail" aria-hidden />;
}
