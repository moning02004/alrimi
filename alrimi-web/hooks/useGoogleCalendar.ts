"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import type { GoogleCalendarStatus } from "@/types";

const key = ["google-calendar"];

/**
 * 구글 캘린더 연결. 일정을 고칠 때마다 옮겨 담는 일은 서버가 뒤에서 한다 —
 * 웹이 할 일은 붙이고, 끊고, 어긋났을 때 다시 맞추라고 누르는 것뿐이다.
 */
export function useGoogleCalendar() {
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: key,
    queryFn: () => api.get<GoogleCalendarStatus>(apiUrl.googleCalendar),
    // 연결 직후 이미 있는 일정을 옮겨 담는 동안은 몇 초 걸린다. 끝났는지 지켜본다.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.connected && !data.last_synced_at && !data.last_error ? 3000 : false;
    },
  });

  /** 동의 화면으로 창을 옮긴다. 돌아오면 설정 화면의 `?google=` 이 결과를 말한다 */
  const connect = useMutation({
    mutationFn: () => api.post<{ url: string }>(apiUrl.googleCalendarConnect),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.delete<void>(apiUrl.googleCalendar),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const resync = useMutation({
    mutationFn: () => api.post<void>(apiUrl.googleCalendarSync),
    // 뒤에서 도는 동안 "옮겨 담는 중" 으로 보이도록 맞춘 때를 비워둔다
    onSuccess: () =>
      qc.setQueryData<GoogleCalendarStatus>(key, (prev) =>
        prev ? { ...prev, last_synced_at: null, last_error: "" } : prev,
      ),
  });

  return { status, connect, disconnect, resync };
}
