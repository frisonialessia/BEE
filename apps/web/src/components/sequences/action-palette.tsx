import {
  CalendarCheck,
  Eye,
  FileText,
  Link2,
  Mail,
  RotateCcw,
  Sparkles,
  ThumbsUp,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/** Catálogo de acciones que un paso de secuencia puede ejecutar — mapea 1:1
 *  a los valores libres que `DynamicSequenceEngine._execute_step` ya acepta
 *  (`action`/`channel` son texto libre en el backend; esto es solo el menú
 *  curado que el builder ofrece). Cada acción crea, al ejecutarse, una
 *  `PendingAction` que el CEO aprueba — el motor nunca dispara nada solo.
 *
 *  `label`/`description` viven en `messages/{locale}/workspace.json` bajo
 *  `sequences.actions.<action>` (ver step-composer.tsx / flow-canvas.tsx) —
 *  este catálogo solo trae el `action` value que sirve de llave de traducción. */
export interface ActionDef {
  action: string;
  channel: "email" | "linkedin";
  icon: LucideIcon;
}

export const ACTION_PALETTE: ActionDef[] = [
  { action: "send_email", channel: "email", icon: Mail },
  { action: "linkedin_profile_view", channel: "linkedin", icon: Eye },
  { action: "linkedin_like", channel: "linkedin", icon: ThumbsUp },
  { action: "linkedin_connect", channel: "linkedin", icon: UserPlus },
  { action: "linkedin_inmail", channel: "linkedin", icon: Sparkles },
  { action: "send_content", channel: "email", icon: FileText },
  { action: "book_meeting", channel: "email", icon: CalendarCheck },
  { action: "follow_up", channel: "email", icon: RotateCcw },
];

export const ACTION_BY_VALUE: Record<string, ActionDef> = Object.fromEntries(
  ACTION_PALETTE.map((a) => [a.action, a]),
);

export const CHANNEL_ICON: Record<string, LucideIcon> = {
  linkedin: Link2,
  email: Mail,
};

export const CHANNEL_COLOR: Record<string, string> = {
  linkedin: "var(--color-chart-4)",
  email: "var(--color-chart-6)",
};
