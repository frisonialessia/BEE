import { SequencesView } from "@/features/sequences/sequences-view";

/**
 * Secuencias en el sandbox — the same page as the dashboard's, with one
 * difference: Rendimiento (the workflow bus and SmartEngagementEngine's AI
 * sentiment/intent classification) is real backend processing, not a
 * business record — same category as Resiliencia's audit log — so it stays
 * honestly gated instead of faking an AI engine. The sequences themselves
 * and the message library are user-authored content, backed by the local
 * demo store like everywhere else live. See `probar/nav-items.ts`.
 */
export default function ProbarSequencesPage() {
  return <SequencesView sandbox />;
}
