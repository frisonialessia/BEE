import { PICKABLE_BEE, pickedColor } from "@/components/charts/palette";
import { cn } from "@/lib/utils";
import type { AvatarColor } from "@/types/auth";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function stableHash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/** A deterministic fallback tone for a user who hasn't picked their own
 *  avatar_color yet — the same id always lands on the same tone, so a
 *  leaderboard or team list doesn't reshuffle colors on every reload, the
 *  way one flat color for every teammate (the old per-page pattern) never
 *  told two people apart at all. */
export function fallbackAvatarColor(id: string): AvatarColor {
  return PICKABLE_BEE[stableHash(id) % PICKABLE_BEE.length] as AvatarColor;
}

/**
 * The one avatar renderer for the whole app: a real photo (`avatarUrl`)
 * when the person has one, else their initials on their own chosen color
 * (`avatarColor`, set from the profile settings' color picker) or, until
 * they pick one, a deterministic per-id fallback tone. Replaces the
 * half-dozen local `initials()`-only copies that used to hardcode a
 * single flat background for every teammate alike.
 */
export function Avatar({
  name,
  id,
  avatarUrl,
  avatarColor,
  size = 32,
  className,
  title,
}: {
  name: string;
  /** Only used to derive the deterministic fallback tone when avatarColor is unset. */
  id: string;
  avatarUrl?: string | null;
  avatarColor?: AvatarColor | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URIs and arbitrary sources, not a static asset
      <img
        src={avatarUrl}
        alt=""
        title={title}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const color = pickedColor(avatarColor) ?? pickedColor(fallbackAvatarColor(id));

  return (
    <span
      title={title}
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, background: color ?? undefined, fontSize: Math.max(9, size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}
