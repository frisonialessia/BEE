import { apiFetch } from "@/lib/api/client";
import type { Meeting } from "@/types/domain";

/** Calendario — dashboard-only for now, no sandbox/demo-mode support yet
 * (unlike Leads/Companies/Opportunities, which all have a local demo store
 * — see lib/demo/store.ts). The nav item only appears in NAV_GROUPS, not
 * PROBAR_NAV_GROUPS, so /probar never links here. */

export interface MeetingCreateIn {
  opportunity_id?: string;
  lead_id?: string;
  title: string;
  purpose?: string;
  starts_at: string;
  duration_minutes?: number;
  meeting_url?: string;
  attendee_user_ids?: string[];
}

export interface MeetingUpdateIn {
  title?: string;
  purpose?: string;
  starts_at?: string;
  duration_minutes?: number;
  meeting_url?: string;
  attendee_user_ids?: string[];
}

export async function fetchMeetings(params?: {
  startsAfter?: string;
  startsBefore?: string;
}): Promise<Meeting[]> {
  const query = new URLSearchParams();
  if (params?.startsAfter) query.set("starts_after", params.startsAfter);
  if (params?.startsBefore) query.set("starts_before", params.startsBefore);
  const qs = query.toString();
  return apiFetch<Meeting[]>(`/api/v1/meetings${qs ? `?${qs}` : ""}`, { cache: "no-store" });
}

export async function createMeeting(body: MeetingCreateIn): Promise<Meeting> {
  return apiFetch<Meeting>("/api/v1/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateMeeting(meetingId: string, body: MeetingUpdateIn): Promise<Meeting> {
  return apiFetch<Meeting>(`/api/v1/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/meetings/${meetingId}`, { method: "DELETE" });
}
