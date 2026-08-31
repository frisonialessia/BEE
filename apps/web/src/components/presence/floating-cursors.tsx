"use client";

import { MousePointer2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useUsers } from "@/hooks/queries/use-users";
import { useAuth } from "@/providers/auth-provider";

interface CursorPos {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

const COLORS = ["var(--color-chart-6)", "var(--color-chart-4)", "var(--color-chart-2)"];

function randomPos() {
  return {
    x: 12 + Math.random() * 70,
    y: 15 + Math.random() * 65,
  };
}

/**
 * Cursores flotantes — decoración ambiental, no colaboración real (BEE no
 * tiene un canal de posición en vivo todavía). Usa nombres reales del
 * equipo para que, si algún día se conecta de verdad, no haya que cambiar
 * nada más que la fuente del dato. Movimiento lento y baja opacidad a
 * propósito, para que ambiente sin estorbar el uso real del dashboard.
 */
export function FloatingCursors() {
  const { data: users } = useUsers();
  const { user: currentUser } = useAuth();
  const [cursors, setCursors] = useState<CursorPos[]>([]);

  useEffect(() => {
    const others = (users ?? []).filter((u) => u.id !== currentUser?.id).slice(0, 2);
    if (others.length === 0) return;

    // One-time seed per users/currentUser change, immediately followed by
    // the interval below — not a state->effect->state loop (same shape as
    // the mount check in providers/auth-provider.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursors(
      others.map((u, i) => ({
        id: u.id,
        name: u.full_name.split(" ")[0],
        color: COLORS[i % COLORS.length],
        ...randomPos(),
      })),
    );

    const interval = window.setInterval(() => {
      setCursors((prev) => prev.map((c) => ({ ...c, ...randomPos() })));
    }, 4500);

    return () => window.clearInterval(interval);
  }, [users, currentUser?.id]);

  return (
    <>
      {cursors.map((c) => (
        <div key={c.id} className="bee-cursor" style={{ left: `${c.x}%`, top: `${c.y}%` }} aria-hidden>
          <MousePointer2 className="size-4" style={{ color: c.color, fill: c.color }} />
          <span className="bee-cursor__label" style={{ background: c.color }}>
            {c.name}
          </span>
        </div>
      ))}
    </>
  );
}
