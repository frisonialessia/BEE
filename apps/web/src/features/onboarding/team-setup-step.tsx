"use client";

import { useState, type FormEvent } from "react";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateTeam } from "@/hooks/queries/use-teams";

/** Second onboarding step, OWNER/ADMIN only (mirrors CompanyProfileStep —
 * see OnboardingIntro for when each step shows). Distinct from
 * CompanyProfileStep on purpose: that one is "tell us about your own
 * company" (an account-profile field), this one is a real, separate
 * action — POST /teams — that structures who reports to whom. Optional:
 * a one-person org doesn't need a team yet, and OWNER/ADMIN can always
 * create one later from Equipo. */
export function TeamSetupStep({ onDone }: { onDone: () => void }) {
  const createTeam = useCreateTeam();
  const [name, setName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    await createTeam.mutateAsync({ name: name.trim() });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="bee-display text-xl">Crea tu primer equipo</DialogTitle>
        <DialogDescription>
          Un equipo agrupa a tus reps y define quién ve el trabajo de quién. Si por ahora son pocos,
          puedes saltarte esto — lo creas cuando quieras desde Equipo.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-1.5">
        <label htmlFor="teamName" className="bee-caption block">
          Nombre del equipo
        </label>
        <input
          id="teamName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bee-input"
          placeholder="Ej: Ventas LATAM"
        />
      </div>

      <DialogFooter className="mt-4">
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Omitir por ahora
        </button>
        <button
          type="submit"
          disabled={!name.trim() || createTeam.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createTeam.isPending ? "Creando…" : "Crear equipo"}
        </button>
      </DialogFooter>
    </form>
  );
}
