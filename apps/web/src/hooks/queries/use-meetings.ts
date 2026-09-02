"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createMeeting,
  deleteMeeting,
  fetchMeetings,
  updateMeeting,
  type MeetingCreateIn,
  type MeetingUpdateIn,
} from "@/lib/api/meetings";
import { queryKeys } from "@/lib/query-keys";

export function useMeetings(params?: { startsAfter?: string; startsBefore?: string }) {
  return useQuery({
    queryKey: queryKeys.meetings.range(params?.startsAfter, params?.startsBefore),
    queryFn: () => fetchMeetings(params),
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MeetingCreateIn) => createMeeting(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all });
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MeetingUpdateIn }) => updateMeeting(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all });
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => deleteMeeting(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all });
    },
  });
}
