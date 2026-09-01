"use client";

import { FormEvent, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { useChangePassword } from "@/hooks/queries/use-auth";
import { useCreateTeam, useTeams } from "@/hooks/queries/use-teams";
import {
  useCreateUser,
  useDeleteMyAccount,
  useDeleteUser,
  useUpdateMyProfile,
  useUpdateUser,
  useUsers,
} from "@/hooks/queries/use-users";
import { OutboundWebhooksSection } from "@/features/team/outbound-webhooks-section";
import { QuotasSection } from "@/features/team/quotas-section";
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
  const t = useTranslations("workspace.team.teams");
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
      toast.success(t("created"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("createError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <label htmlFor="team-name" className="bee-caption block">
          {t("form.newTeamLabel")}
        </label>
        <input
          id="team-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bee-input w-48"
          placeholder={t("form.namePlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="team-parent" className="bee-caption block">
          {t("form.reportsToLabel")}
        </label>
        <select
          id="team-parent"
          value={parentTeamId}
          onChange={(e) => setParentTeamId(e.target.value)}
          className="bee-input w-48"
        >
          <option value="">{t("form.topLevelOption")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={createTeam.isPending} className="bee-btn bee-btn--primary">
        {createTeam.isPending ? t("form.creating") : t("form.create")}
      </button>
    </form>
  );
}

function InviteUserForm({ teams }: { teams: TeamOut[] }) {
  const t = useTranslations("workspace.team.people");
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
      toast.success(t("form.added"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("form.addError"));
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
        placeholder={t("form.fullNamePlaceholder")}
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bee-input"
        placeholder={t("form.emailPlaceholder")}
      />
      <input
        required
        type="password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="bee-input"
        placeholder={t("form.passwordPlaceholder")}
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
        <option value="">{t("noTeam")}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={createUser.isPending}
        className="bee-btn bee-btn--primary sm:col-span-2 lg:col-span-5"
      >
        {createUser.isPending ? t("form.adding") : t("form.add")}
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
  const t = useTranslations("workspace.team.people");
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const teamName = teams.find((tm) => tm.id === user.team_id)?.name ?? "—";
  // The org OWNER's role can't be changed (backend enforces this too — see
  // app/api/v1/endpoints/users.py) so editing it here would just 403.
  const canEditRole = canManage && user.role !== "owner";
  // Mirrors the backend's own guardrails (app/api/v1/endpoints/users.py
  // delete_user): the OWNER can't be removed by anyone, and nobody can
  // remove themselves — both would just 403 if attempted.
  const canRemove = canManage && user.role !== "owner" && !isSelf;

  async function handleRoleChange(role: UserRole) {
    try {
      await updateUser.mutateAsync({ userId: user.id, body: { role } });
      toast.success(t("roleUpdated", { role: ROLE_LABELS[role] }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("roleUpdateError"));
    }
  }

  async function handleTeamChange(teamId: string) {
    try {
      await updateUser.mutateAsync({ userId: user.id, body: { team_id: teamId || null } });
      toast.success(t("teamUpdated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("teamUpdateError"));
    }
  }

  async function handleRemove() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteUser.mutateAsync(user.id);
      toast.success(t("memberRemoved", { name: user.full_name }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("removeError"));
    } finally {
      setConfirmingDelete(false);
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-3">
        <div className="font-medium">
          {user.full_name}
          {isSelf && <span className="bee-caption ml-1.5">{t("you")}</span>}
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
            <option value="">{t("noTeam")}</option>
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
      <td className="py-2.5 pr-3">
        <Badge variant={user.is_active ? "success" : "warning"}>
          {user.is_active ? t("active") : t("inactive")}
        </Badge>
      </td>
      {canManage && (
        <td className="py-2.5 text-right">
          {canRemove && (
            <button
              type="button"
              onClick={handleRemove}
              onBlur={() => setConfirmingDelete(false)}
              disabled={deleteUser.isPending}
              className={confirmingDelete ? "bee-btn-ghost bee-btn-ghost--fill" : "bee-btn-ghost"}
              style={
                confirmingDelete
                  ? ({
                      "--bee-fill": "var(--color-chart-2)",
                      "--bee-fill-text": "var(--color-background)",
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {confirmingDelete ? t("confirmDelete") : t("delete")}
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

/** Self-service profile — name, avatar, phone, bio. Every role gets this,
 * same "no role required, just logged in" posture as ChangePasswordSection
 * below (PATCH /users/me has no role dependency either). */
function MyProfileSection() {
  const t = useTranslations("workspace.team.profile");
  const { user: currentUser, setUser } = useAuth();
  const updateProfile = useUpdateMyProfile();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(currentUser?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url ?? "");
  const [phone, setPhone] = useState(currentUser?.phone ?? "");
  const [bio, setBio] = useState(currentUser?.bio ?? "");

  function openForm() {
    setFullName(currentUser?.full_name ?? "");
    setAvatarUrl(currentUser?.avatar_url ?? "");
    setPhone(currentUser?.phone ?? "");
    setBio(currentUser?.bio ?? "");
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const updated = await updateProfile.mutateAsync({
        full_name: fullName.trim() || undefined,
        avatar_url: avatarUrl.trim() || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
      });
      setUser(updated);
      toast.success(t("updated"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("updateError"));
    }
  }

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 text-base font-semibold">{t("title")}</h2>
        </div>
        {!open && (
          <button type="button" onClick={openForm} className="bee-btn-ghost">
            {t("edit")}
          </button>
        )}
      </div>

      {open ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="bee-caption">{t("nameLabel")}</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bee-input"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="bee-caption">{t("phoneLabel")}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bee-input"
                placeholder={t("phonePlaceholder")}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="bee-caption">{t("avatarLabel")}</span>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="bee-input"
                placeholder={t("avatarPlaceholder")}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="bee-caption">{t("bioLabel")}</span>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="bee-input"
                placeholder={t("bioPlaceholder")}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="bee-btn bee-btn--primary"
            >
              {updateProfile.isPending ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="bee-btn-ghost">
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="bee-caption">{t("phoneLabel")}</dt>
            <dd>{currentUser?.phone || t("empty")}</dd>
          </div>
          <div>
            <dt className="bee-caption">{t("bioLabel")}</dt>
            <dd>{currentUser?.bio || t("empty")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/** Self-service account deletion — deactivation, not a hard delete (see
 * DELETE /users/me's docstring on the backend). Two-click confirm, same
 * pattern as UserRow's own remove-teammate action above, just with an
 * explicit warning box given the destination is "you can no longer log
 * in" rather than "removed from a list". */
function DeleteAccountSection() {
  const t = useTranslations("workspace.team.deleteAccount");
  const { user: currentUser, logout } = useAuth();
  const deleteAccount = useDeleteMyAccount();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    try {
      await deleteAccount.mutateAsync();
      logout();
      router.replace("/login");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.status === 403
            ? t("ownerBlocked")
            : err.message
          : t("deleteError"),
      );
      setConfirming(false);
    }
  }

  if (currentUser?.role === "owner") {
    // Same guard as the backend (DELETE /users/me returns 403 for OWNER) —
    // shown up front instead of letting them click through to a failure.
    return (
      <section className="bee-bento bee-bento-pad-lg space-y-2">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="bee-caption">{t("ownerBlocked")}</p>
      </section>
    );
  }

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-3">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <p className="bee-caption">{t("body")}</p>

      {confirming ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-chart-2)] bg-[var(--color-chart-2)]/10 p-3">
          <p className="text-sm font-semibold">{t("confirmTitle")}</p>
          <p className="bee-caption">{t("confirmBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteAccount.isPending}
              className="bee-btn bee-btn--primary"
              style={{ "--bee-fill": "var(--color-chart-2)", "--bee-fill-text": "#fff" } as React.CSSProperties}
            >
              {t("confirmButton")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="bee-btn-ghost">
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="bee-btn-ghost">
          {t("button")}
        </button>
      )}
    </section>
  );
}

/** Self-service password change — every role gets this, not just OWNER/ADMIN
 * (the backend endpoint requires no role at all, only being logged in — see
 * PATCH /auth/me/password). */
function ChangePasswordSection() {
  const t = useTranslations("workspace.team.password");
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(t("updated"));
      setCurrentPassword("");
      setNewPassword("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("updateError"));
    }
  }

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 text-base font-semibold">{t("title")}</h2>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="bee-btn-ghost">
            {t("change")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-3">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="bee-input"
            placeholder={t("currentPlaceholder")}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="bee-input"
            placeholder={t("newPlaceholder")}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="bee-btn bee-btn--primary flex-1"
            >
              {changePassword.isPending ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCurrentPassword("");
                setNewPassword("");
              }}
              className="bee-btn-ghost"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
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
  const t = useTranslations("workspace.team");
  const { user: currentUser } = useAuth();
  const { data: teams, isLoading: teamsLoading, isError: teamsError } = useTeams();
  const { data: users, isLoading: usersLoading, isError: usersError } = useUsers();
  const { depthOf, ordered } = useTeamTree(teams ?? []);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "admin";
  const loading = teamsLoading || usersLoading;
  const hasError = teamsError || usersError;

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : hasError ? (
        <p className="bee-caption">{t("loadError")}</p>
      ) : (
        <div className="space-y-6">
          <MyProfileSection />

          <ChangePasswordSection />

          <section className="bee-bento bee-bento-pad-lg space-y-4">
            <div>
              <p className="bee-eyebrow">{t("teams.eyebrow")}</p>
              <h2 className="mt-1 text-base font-semibold">{t("teams.title")}</h2>
            </div>

            {ordered.length === 0 ? (
              <p className="bee-caption">{t("teams.empty")}</p>
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
              <p className="bee-eyebrow">{t("people.eyebrow")}</p>
              <h2 className="mt-1 text-base font-semibold">
                {canManage ? t("people.allOrg") : t("people.youAndTeam")}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">{t("people.table.person")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("people.table.role")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("people.table.team")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("people.table.status")}</th>
                    {canManage && <th className="pb-2 font-medium" />}
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

          <QuotasSection users={users ?? []} teams={teams ?? []} canManage={canManage} />

          <OutboundWebhooksSection canManage={canManage} />

          <DeleteAccountSection />
        </div>
      )}
    </div>
  );
}
