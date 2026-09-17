"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl, type EventFilter } from "@/constants/routeUrl";
import type {
  ZoneScope,
  AlertItem,
  CalendarEvent,
  EditScope,
  EventDetail,
  EventListItem,
  EventPayload,
} from "@/types";

export const eventKeys = {
  list: (filter: EventFilter, scope: ZoneScope) =>
    ["events", filter, scope] as const,
  byDate: (date: string, scope: ZoneScope) => ["events", "date", date, scope] as const,
  range: (from: string, to: string, scope: ZoneScope) =>
    ["events", "range", from, to, scope] as const,
  detail: (eventId: number) => ["event", eventId] as const,
  search: (q: string, scope: ZoneScope) => ["events", "search", q, scope] as const,
  calendar: (from: string, to: string, scope: ZoneScope) =>
    ["calendar", from, to, scope] as const,
};

/**
 * enabled를 끄면 요청이 나가지 않는다.
 * "이후 일정"은 접힌 상태에서 호출하지 않다가 펼칠 때 한 번만 가져온다.
 */
export function useEvents(filter: EventFilter, scope: ZoneScope, enabled = true) {
  return useQuery({
    queryKey: eventKeys.list(filter, scope),
    queryFn: () => api.get<EventListItem[]>(apiUrl.events(filter, scope)),
    enabled,
  });
}

/** 주간 스트립이 그린 기간. 스트립을 앞뒤로 넘기면 목록도 같이 넘어간다 */
export function useEventsInRange(
  from: string,
  to: string,
  scope: ZoneScope,
  enabled = true,
) {
  return useQuery({
    queryKey: eventKeys.range(from, to, scope),
    queryFn: () => api.get<EventListItem[]>(apiUrl.eventsInRange(from, to, scope)),
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
export function useEventsByDate(date: string, scope: ZoneScope, enabled = true) {
  return useQuery({
    queryKey: eventKeys.byDate(date, scope),
    queryFn: () => api.get<EventListItem[]>(apiUrl.eventsByDate(date, scope)),
    enabled,
  });
}

/** 주간 스트립·월간 그리드가 그리는 띠. 일정 본문과 따로 받아 주를 넘겨도 가볍다 */
export function useCalendar(from: string, to: string, scope: ZoneScope) {
  return useQuery({
    queryKey: eventKeys.calendar(from, to, scope),
    queryFn: () => api.get<CalendarEvent[]>(apiUrl.calendar(from, to, scope)),
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

/**
 * 고친다. 반복 일정이면 `scope` 로 어디까지 닿을지 고른다 — "이후 모두" 면 뒤따르는
 * 일정의 상세도 바뀌므로 상세 캐시를 통째로 버린다.
 */
export function useUpdateEvent(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope = "this", ...payload }: Partial<EventPayload> & { scope?: EditScope }) =>
      api.patch<EventDetail>(apiUrl.eventScoped(eventId, scope), payload),
    onSuccess: (_saved, { scope }) => {
      qc.invalidateQueries({ queryKey: scope === "following" ? ["event"] : eventKeys.detail(eventId) });
      invalidateAll(qc);
    },
  });
}

/**
 * 제목·내용 검색. 두 글자부터 부른다 — 한 글자는 거의 모든 일정에 걸려 목록이
 * 쏟아지고, 타자를 칠 때마다 요청이 나간다. 입력을 잠깐 멈췄을 때 부르는 것은
 * 부르는 쪽(`app/(main)/search`)이 맡는다.
 */
export function useSearchEvents(q: string, scope: ZoneScope) {
  const term = q.trim();
  return useQuery({
    queryKey: eventKeys.search(term, scope),
    queryFn: () => api.get<EventListItem[]>(apiUrl.searchEvents(term, scope)),
    enabled: term.length >= 2,
    // 한 글자 더 칠 때마다 결과가 비었다가 다시 차면 깜빡인다. 앞 결과를 깔고 있는다.
    placeholderData: (previous) => previous,
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
 * 여러 개를 한 번에 지운다(`POST /events/bulk-delete`). 서버가 한 트랜잭션으로
 * 지우므로 요청이 실패하면 아무것도 안 지워진 것이다.
 */
export function useDeleteEvents() {
  const qc = useQueryClient();
  return useMutation({
    // 서버는 이미 없거나 남의 것인 id 를 건너뛴다. 보낸 개수와의 차이를 "못 지운 것" 으로 센다
    mutationFn: async (ids: number[]) => {
      const { deleted } = await api.post<{ deleted: number }>(apiUrl.bulkDeleteEvents, { ids });
      return { deleted, failed: ids.length - deleted };
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** 지운다. 반복 일정이면 `scope: "following"` 으로 뒤따르는 것까지 지운다 */
export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, scope = "this" }: { eventId: number; scope?: EditScope }) =>
      api.delete<void>(apiUrl.eventScoped(eventId, scope)),
    onSuccess: () => invalidateAll(qc),
  });
}
