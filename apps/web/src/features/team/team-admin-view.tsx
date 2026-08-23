"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { useCreateTeam, useTeams } from "@/hooks/queries/use-teams";
import { useCreateUser, useUpdateUser, useUsers } from "@/hooks/queries/use-users";
import { ROLE_LABELS, type TeamOut, type UserOut, type UserRole } from "@/types/auth";
import { ApiError } from "@/types/api";

const ROLE_OPTIONS: UserRole[] = ["admin", "manager", "member"];

/** Build a parent → children lookup and return each team's depth for indentation. */
function useTeamTree(teams: TeamOut[]) {
  return useMemo(() => {
    const byParent = new Map<string | null, TeamOut[]>();
    for (const team of teams) {
      const key = team.parent_team_id;
      byParent.set(key, [...(byParent.get(key) ?? []), team]);
    }

    const depthOf = new Map<string, number>();
    function walk(parentId: string | null, depth: number) {
      for (const team of byParent.get(parentId) ?? []) {
        depthOf.set(team.id, depth);
        walk(team.id, depth + 1);
      }
    }
    walk(null, 0);

    // Roots first, each followed by its descendants (depth-first) — a stable
    // reading order for a flat list that still reads as a tree.
    const ordered: TeamOut[] = [];
    function collect(parentId: string | null) {
      for (const team of byParent.get(parentId) ?? []) {
        ordered.push(team);
        collect(team.id);
      }
    }
    collect(null);

    return { ordered, depthOf };
  }, [teams]);
}

function CreateTeamForm({ teams }: { teams: TeamOut[] }) {
  const createTeam = useCreateTeam();
  const [name, setName] = useState("");
  const [parentTeamId, setParentTeamId] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createTeam.mutateAsync({
        name,
        parent_team_id: parentTeamId || null,
      });
      setName("");
      setParentTeamId("");
      toast.success("Equipo creado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el equipo.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <label htmlFor="team-name" className="bee-caption block">
          Nuevo equipo
        </label>
        <input
          id="team-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bee-input w-48"
          placeholder="Ej. Sales EMEA"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="team-parent" className="bee-caption block">
          Reporta a
        </label>
        <select
          id="team-parent"
          value={parentTeamId}
          onChange={(e) => setParentTeamId(e.target.value)}
          className="bee-input w-48"
        >
          <option value="">— Nivel superior —</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={createTeam.isPending} className="bee-btn bee-btn--dark">
        {createTeam.isPending ? "Creando…" : "Crear equipo"}
      </button>
    </form>
  );
}

function InviteUserForm({ teams }: { teams: TeamOut[] }) {
  const createUser = useCreateUser();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [teamId, setTeamId] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createUser.mutateAsync({
        email,
        full_name: fullName,
        password,
        role,
        team_id: teamId || null,
      });
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("member");
      setTeamId("");
      toast.success("Teammate agregado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo agregar al teammate.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <input
        required
        type="text"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="bee-input"
        placeholder="Nombre completo"
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bee-input"
        placeholder="Email"
      />
      <input
        required
        type="password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="bee-input"
        placeholder="Contraseña temporal"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        className="bee-input"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="bee-input">
        <option value="">Sin equipo</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={createUser.isPending}
        className="bee-btn bee-btn--dark sm:col-span-2 lg:col-span-5"
      >
        {createUser.isPending ? "Agregando…" : "Agregar teammate"}
      </button>
    </form>
  );
}

function UserRow({
  user,
  teams,
  canManage,
  isSelf,
}: {
  user: UserOut;
  teams: TeamOut[];
  canManage: boolean;
  isSelf: boolean;
}) {
  const updateUser = useUpdateUser();
  const teamName = teams.find((t) => t.id === user.team_id)?.name ?? "—";
  // The org OWNER's role can't be changed (backend enforces this too — see
  // app/api/v1/endpoints/users.py) so editing it here would just 403.
  const canEditRole = canManage && user.role !== "owner";

  async function handleRoleChange(role: UserRole) {
    try {
      await updateUser.mutateAsync({ userId: user.id, body: { role } });
      toast.success(`Rol actualizado a ${ROLE_LABELS[role]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar el rol.");
    }
  }

  async function handleTeamChange(teamId: string) {
    try {
      await updateUser.mutateAsync({ userId: user.id, body: { team_id: teamId || null } });
      toast.success("Equipo actualizado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar el equipo.");
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-3">
        <div className="font-medium">
          {user.full_name}
          {isSelf && <span className="bee-caption ml-1.5">(tú)</span>}
        </div>
        <div className="bee-caption">{user.email}</div>
      </td>
      <td className="py-2.5 pr-3">
        {canEditRole ? (
          <select
            value={user.role}
            onChange={(e) => handleRoleChange(e.target.value as UserRole)}
            className="bee-input w-32"
            disabled={updateUser.isPending}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <Badge variant={user.role === "owner" ? "success" : "default"}>
            {ROLE_LABELS[user.role]}
          </Badge>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {canManage && user.role !== "owner" ? (
          <select
            value={user.team_id ?? ""}
            onChange={(e) => handleTeamChange(e.target.value)}
            className="bee-input w-40"
            disabled={updateUser.isPending}
          >
            <option value="">Sin equipo</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        ) : (
          teamName
        )}
      </td>
      <td className="py-2.5">
        <Badge variant={user.is_active ? "success" : "warning"}>
          {user.is_active ? "Activo" : "Inactivo"}
        </Badge>
      </td>
    </tr>
  );
}

/**
 * Team / Admin — who's on the team, what they can see.
 *
 * Read access matches the backend visibility rule: OWNER/ADMIN see everyone
 * in the org, MANAGER sees their subtree, MEMBER sees only themselves (see
 * `app.services.permissions` on the API). Write actions (create team/user,
 * change role/team) are gated to OWNER/ADMIN in the UI — and enforced again
 * server-side regardless.
 */
export function TeamAdminView() {
  const { user: currentUser } = useAuth();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { depthOf, ordered } = useTeamTree(teams ?? []);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "admin";
  const loading = teamsLoading || usersLoading;

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Organización</p>
        <div className="mt-1">
          <h1 className="bee-display">Equipo</h1>
          <p className="bee-caption mt-1">
            Jerarquía de equipos y visibilidad por rol — quién ve qué en el pipeline
          </p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="bee-bento bee-bento-pad-lg space-y-4">
            <div>
              <p className="bee-eyebrow">Equipos</p>
              <h2 className="mt-1 text-base font-semibold">Jerarquía de managers</h2>
            </div>

            {ordered.length === 0 ? (
              <p className="bee-caption">Todavía no hay equipos — creá el primero abajo.</p>
            ) : (
              <ul className="space-y-1.5">
                {ordered.map((team) => (
                  <li
                    key={team.id}
                    className="bee-caption flex items-center gap-2 text-sm text-foreground"
                    style={{ paddingLeft: `${(depthOf.get(team.id) ?? 0) * 1.25}rem` }}
                  >
                    <span className="text-muted-foreground">
                      {(depthOf.get(team.id) ?? 0) > 0 ? "└─" : "▸"}
                    </span>
                    {team.name}
                  </li>
                ))}
              </ul>
            )}

            {canManage && <CreateTeamForm teams={teams ?? []} />}
          </section>

          <section className="bee-bento bee-bento-pad-lg space-y-4">
            <div>
              <p className="bee-eyebrow">Personas</p>
              <h2 className="mt-1 text-base font-semibold">
                {canManage ? "Toda la organización" : "Vos y tu equipo"}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Persona</th>
                    <th className="pb-2 pr-3 font-medium">Rol</th>
                    <th className="pb-2 pr-3 font-medium">Equipo</th>
                    <th className="pb-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(users ?? []).map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      teams={teams ?? []}
                      canManage={canManage}
                      isSelf={u.id === currentUser?.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {canManage && <InviteUserForm teams={teams ?? []} />}
          </section>
        </div>
      )}
    </div>
  );
}
