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
 *  `PendingAction` que el CEO aprueba — el motor nunca dispara nada solo. */
export interface ActionDef {
  action: string;
  label: string;
  channel: "email" | "linkedin";
  icon: LucideIcon;
  description: string;
}

export const ACTION_PALETTE: ActionDef[] = [
  {
    action: "send_email",
    label: "Enviar email",
    channel: "email",
    icon: Mail,
    description: "Email personalizado, generado por el ExecutiveAgent",
  },
  {
    action: "linkedin_profile_view",
    label: "Visitar perfil de LinkedIn",
    channel: "linkedin",
    icon: Eye,
    description: "Deja huella pasiva antes del contacto directo",
  },
  {
    action: "linkedin_like",
    label: "Dar like a una publicación",
    channel: "linkedin",
    icon: ThumbsUp,
    description: "Calienta el contacto antes del mensaje",
  },
  {
    action: "linkedin_connect",
    label: "Solicitud de conexión",
    channel: "linkedin",
    icon: UserPlus,
    description: "Invitación con nota personalizada",
  },
  {
    action: "linkedin_inmail",
    label: "InMail personalizado (IA)",
    channel: "linkedin",
    icon: Sparkles,
    description: "Mensaje directo generado con el contexto de la señal",
  },
  {
    action: "send_content",
    label: "Enviar contenido",
    channel: "email",
    icon: FileText,
    description: "Caso de estudio o recurso relevante",
  },
  {
    action: "book_meeting",
    label: "Agendar reunión",
    channel: "email",
    icon: CalendarCheck,
    description: "Invitación a llamada — normalmente el cierre del flujo",
  },
  {
    action: "follow_up",
    label: "Seguimiento",
    channel: "email",
    icon: RotateCcw,
    description: "Recordatorio si no hubo respuesta",
  },
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
