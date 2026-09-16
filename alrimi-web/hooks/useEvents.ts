"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl, type EventFilter } from "@/constants/routeUrl";
import type { AlertItem, CalendarEvent, EventDetail, EventListItem, EventPayload } from "@/types";

export const eventKeys = {
  list: (filter: EventFilter, zoneId: number | null) =>
    ["events", filter, zoneId] as const,
  byDate: (date: string, zoneId: number | null) => ["events", "date", date, zoneId] as const,
  range: (from: string, to: string, zoneId: number | null) =>
    ["events", "range", from, to, zoneId] as const,
  detail: (eventId: number) => ["event", eventId] as const,
  calendar: (from: string, to: string, zoneId: number | null) =>
    ["calendar", from, to, zoneId] as const,
};

/**
 * enabled를 끄면 요청이 나가지 않는다.
 * "이후 일정"은 접힌 상태에서 호출하지 않다가 펼칠 때 한 번만 가져온다.
 */
export function useEvents(filter: EventFilter, zoneId: number | null, enabled = true) {
  return useQuery({
    queryKey: eventKeys.list(filter, zoneId),
    queryFn: () => api.get<EventListItem[]>(apiUrl.events(filter, zoneId)),
    enabled,
  });
}

/** 주간 스트립이 그린 기간. 스트립을 앞뒤로 넘기면 목록도 같이 넘어간다 */
export function useEventsInRange(
  from: string,
  to: string,
  zoneId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: eventKeys.range(from, to, zoneId),
    queryFn: () => api.get<EventListItem[]>(apiUrl.eventsInRange(from, to, zoneId)),
    enabled,
  });
}

/** 상세 화면의 완료 토글. 알림 코드를 다시 보내지 않아도 된다 */
export function useToggleComplete(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (completed: boolean) =>
      api.patch<EventDetail>(apiUrl.event(eventId), { completed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      invalidateAll(qc);
    },
  });
}

/** 달력을 펼쳤을 때 선택한 하루만 */
export function useEventsByDate(date: string, zoneId: number | null, enabled = true) {
  return useQuery({
    queryKey: eventKeys.byDate(date, zoneId),
    queryFn: () => api.get<EventListItem[]>(apiUrl.eventsByDate(date, zoneId)),
    enabled,
  });
}

/** 주간 스트립·월간 그리드가 그리는 띠. 일정 본문과 따로 받아 주를 넘겨도 가볍다 */
export function useCalendar(from: string, to: string, zoneId: number | null) {
  return useQuery({
    queryKey: eventKeys.calendar(from, to, zoneId),
    queryFn: () => api.get<CalendarEvent[]>(apiUrl.calendar(from, to, zoneId)),
    staleTime: 60_000,
    // 기간을 옮기거나 달력을 펼치면 키가 바뀌어 데이터가 잠깐 빈다. 그 사이
    // 표시가 사라졌다 돌아오면 여닫는 동작이 깜빡이므로 이전 것을 깔고 있는다.
    placeholderData: (previous) => previous,
  });
}

/**
 * `enabled` 를 끄면 요청이 나가지 않는다. 보류함 카드가 "다시 잡기" 를 누른
 * 뒤에야 상세를 받아온다 — 목록에는 내용·알림 코드가 안 실려 오는데, 그것을
 * 미리 다 받아두면 보류함을 여는 것만으로 카드 수만큼 요청이 나간다.
 */
export function useEvent(eventId: number, enabled = true) {
  return useQuery({
    queryKey: eventKeys.detail(eventId),
    queryFn: () => api.get<EventDetail>(apiUrl.event(eventId)),
    enabled,
  });
}

/**
 * 상세 화면의 보류 토글. 완료와 같은 모양이라 알림 코드를 다시 보내지 않아도 된다.
 *
 * **푸는 쪽은 이것으로 하지 않는다.** 다시 잡으려면 새 날짜가 함께 가야 해서
 * (서버가 지난 날짜로 푸는 것을 막는다) 그쪽은 폼이 통째로 맡는다 — `EventForm`
 * 의 `resume`.
 */
export function useHold(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (held: boolean) => api.patch<EventDetail>(apiUrl.event(eventId), { held }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      invalidateAll(qc);
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["events"] });
  qc.invalidateQueries({ queryKey: ["calendar"] });
  qc.invalidateQueries({ queryKey: ["zones"] });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EventPayload) =>
      api.post<EventDetail>(apiUrl.createEvent, payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateEvent(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<EventPayload>) =>
      api.patch<EventDetail>(apiUrl.event(eventId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      invalidateAll(qc);
    },
  });
}

/**
 * 예약 시각을 기다리지 않고 지금 보낸다.
 *
 * 보낸 것으로 기록되므로 목록 카드의 발송 점도 함께 늘어난다 — 상세만 새로
 * 받으면 뒤로 갔을 때 카드가 옛 개수를 그린다.
 */
export function useSendAlert(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: number) =>
      api.post<AlertItem>(apiUrl.sendAlert(eventId, alertId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      invalidateAll(qc);
    },
    // 실패도 서버에 status="fail" 로 남으므로 상세를 다시 받아야 화면이 맞는다
    onError: () => qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) }),
  });
}

/**
 * 여러 개를 한 번에 지운다. 서버에 묶음 삭제가 없어 낱개로 나란히 보낸다 —
 * 한 줌이면 충분하고, 그만큼을 위해 새 엔드포인트를 열 이유가 없다.
 *
 * 하나가 실패해도 나머지는 계속 지운다(`allSettled`). 도중에 멈추면 무엇이 지워졌고
 * 무엇이 남았는지 알 수 없어, 고른 것을 다시 세어봐야 한다.
 */
export function useDeleteEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.delete<void>(apiUrl.event(id))),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { deleted: ids.length - failed, failed };
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => api.delete<void>(apiUrl.event(eventId)),
    onSuccess: () => invalidateAll(qc),
  });
}
