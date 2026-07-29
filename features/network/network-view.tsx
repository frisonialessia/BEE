"use client";

import { NetworkNavigatorPanel } from "@/components/network-navigator";

/** Network Navigator — caminos de introducción cálida dentro de la red de contactos. */
export function NetworkView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Network Navigator</p>
        <div className="mt-1">
          <h1 className="bee-display">Red</h1>
          <p className="bee-caption mt-1">
            Rutas de introducción cálida — quién conoce a quién antes de tocar en frío
          </p>
        </div>
      </header>

      <NetworkNavigatorPanel />
    </div>
  );
}
