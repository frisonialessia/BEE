import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import {
  demoCompleteMeeting,
  demoCreateMeeting,
  demoDeleteMeeting,
  demoFetchMeetings,
  demoRespondToMeeting,
  demoUpdateMeeting,
} from "@/lib/demo/store";
import type { Meeting, MeetingColor } from "@/types/domain";

/** Calendario — fully interactive in the sandbox too (see lib/demo/store.ts's
 * Meetings section): seeded with meetings tied to the sandbox's own demo
 * pipeline, and every create/edit/delete below persists locally like the
 * rest of /probar's mutable sections (Tasks, Templates, Sequences...). */

export interface MeetingCreateIn {
  opportunity_id?: string;
  lead_id?: string;
  title: string;
  purpose?: string;
  starts_at: string;
  duration_minutes?: number;
  meeting_url?: string;
  attendee_user_ids?: string[];
  color?: MeetingColor;
}

export interface MeetingUpdateIn {
  title?: string;
  purpose?: string;
  starts_at?: string;
  duration_minutes?: number;
  meeting_url?: string;
  attendee_user_ids?: string[];
  color?: MeetingColor;
}

export async function fetchMeetings(params?: {
  startsAfter?: string;
  startsBefore?: string;
}): Promise<Meeting[]> {
  if (isDemoMode()) {
    return demoFetchMeetings({ startsAfter: params?.startsAfter, startsBefore: params?.startsBefore });
  }
  const query = new URLSearchParams();
  if (params?.startsAfter) query.set("starts_after", params.startsAfter);
  if (params?.startsBefore) query.set("starts_before", params.startsBefore);
  const qs = query.toString();
  return apiFetch<Meeting[]>(`/api/v1/meetings${qs ? `?${qs}` : ""}`, { cache: "no-store" });
}

export async function createMeeting(body: MeetingCreateIn): Promise<Meeting> {
  if (isDemoMode()) return demoCreateMeeting(body);
  return apiFetch<Meeting>("/api/v1/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateMeeting(meetingId: string, body: MeetingUpdateIn): Promise<Meeting> {
  if (isDemoMode()) return demoUpdateMeeting(meetingId, body);
  return apiFetch<Meeting>(`/api/v1/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Marks a meeting as having actually happened — the one action that
 * feeds it back into the rest of BEE (meetings_held_count, an engagement
 * signal on the linked account). Scheduling/editing/deleting a meeting
 * never does this on their own; see POST /meetings/{id}/complete's own
 * docstring on the backend. */
export async function completeMeeting(meetingId: string): Promise<Meeting> {
  if (isDemoMode()) return demoCompleteMeeting(meetingId);
  return apiFetch<Meeting>(`/api/v1/meetings/${meetingId}/complete`, { method: "POST" });
}

/** An attendee accepting/declining an invite someone else booked for
 * them — see POST /meetings/{id}/respond's own docstring on the backend
 * for why only an actual attendee can call this. */
export async function respondToMeeting(
  meetingId: string,
  response: "accepted" | "declined",
): Promise<Meeting> {
  if (isDemoMode()) return demoRespondToMeeting(meetingId, response);
  return apiFetch<Meeting>(`/api/v1/meetings/${meetingId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  });
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  if (isDemoMode()) {
    demoDeleteMeeting(meetingId);
    return;
  }
  await apiFetch<void>(`/api/v1/meetings/${meetingId}`, { method: "DELETE" });
}
