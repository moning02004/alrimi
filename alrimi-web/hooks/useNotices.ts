"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl, type NoticeFilter } from "@/constants/routeUrl";
import type { AlertItem, CalendarMap, NoticeDetail, NoticeListItem, NoticePayload } from "@/types";

export const noticeKeys = {
  list: (filter: NoticeFilter, zoneId: number | null) =>
    ["notices", filter, zoneId] as const,
  byDate: (date: string, zoneId: number | null) => ["notices", "date", date, zoneId] as const,
  range: (from: string, to: string, zoneId: number | null) =>
    ["notices", "range", from, to, zoneId] as const,
  detail: (noticeId: number) => ["notice", noticeId] as const,
  calendar: (from: string, to: string, zoneId: number | null) =>
    ["calendar", from, to, zoneId] as const,
};

/**
 * enabled를 끄면 요청이 나가지 않는다.
 * "이후 일정"은 접힌 상태에서 호출하지 않다가 펼칠 때 한 번만 가져온다.
 */
export function useNotices(filter: NoticeFilter, zoneId: number | null, enabled = true) {
  return useQuery({
    queryKey: noticeKeys.list(filter, zoneId),
    queryFn: () => api.get<NoticeListItem[]>(apiUrl.notices(filter, zoneId)),
    enabled,
  });
}

/** 주간 스트립이 그린 기간. 스트립을 앞뒤로 넘기면 목록도 같이 넘어간다 */
export function useNoticesInRange(
  from: string,
  to: string,
  zoneId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: noticeKeys.range(from, to, zoneId),
    queryFn: () => api.get<NoticeListItem[]>(apiUrl.noticesInRange(from, to, zoneId)),
    enabled,
  });
}

/** 상세 화면의 완료 토글. 알림 코드를 다시 보내지 않아도 된다 */
export function useToggleComplete(noticeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (completed: boolean) =>
      api.patch<NoticeDetail>(apiUrl.notice(noticeId), { completed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noticeKeys.detail(noticeId) });
      invalidateAll(qc);
    },
  });
}

/** 달력을 펼쳤을 때 선택한 하루만 */
export function useNoticesByDate(date: string, zoneId: number | null, enabled = true) {
  return useQuery({
    queryKey: noticeKeys.byDate(date, zoneId),
    queryFn: () => api.get<NoticeListItem[]>(apiUrl.noticesByDate(date, zoneId)),
    enabled,
  });
}

/** 주간 스트립·월간 그리드의 표시. 일정 본문과 따로 받아 주를 넘겨도 가볍다 */
export function useCalendar(from: string, to: string, zoneId: number | null) {
  return useQuery({
    queryKey: noticeKeys.calendar(from, to, zoneId),
    queryFn: () => api.get<CalendarMap>(apiUrl.calendar(from, to, zoneId)),
    staleTime: 60_000,
    // 기간을 옮기거나 달력을 펼치면 키가 바뀌어 데이터가 잠깐 빈다. 그 사이
    // 표시가 사라졌다 돌아오면 여닫는 동작이 깜빡이므로 이전 것을 깔고 있는다.
    placeholderData: (previous) => previous,
  });
}

export function useNotice(noticeId: number) {
  return useQuery({
    queryKey: noticeKeys.detail(noticeId),
    queryFn: () => api.get<NoticeDetail>(apiUrl.notice(noticeId)),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["notices"] });
  qc.invalidateQueries({ queryKey: ["calendar"] });
  qc.invalidateQueries({ queryKey: ["zones"] });
}

export function useCreateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NoticePayload) =>
      api.post<NoticeDetail>(apiUrl.createNotice, payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateNotice(noticeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<NoticePayload>) =>
      api.patch<NoticeDetail>(apiUrl.notice(noticeId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noticeKeys.detail(noticeId) });
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
export function useSendAlert(noticeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: number) =>
      api.post<AlertItem>(apiUrl.sendAlert(noticeId, alertId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noticeKeys.detail(noticeId) });
      invalidateAll(qc);
    },
    // 실패도 서버에 status="fail" 로 남으므로 상세를 다시 받아야 화면이 맞는다
    onError: () => qc.invalidateQueries({ queryKey: noticeKeys.detail(noticeId) }),
  });
}

export function useDeleteNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: number) => api.delete<void>(apiUrl.notice(noticeId)),
    onSuccess: () => invalidateAll(qc),
  });
}
