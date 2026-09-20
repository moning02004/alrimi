"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import type { Me } from "@/types";

/** `enabled` 는 로그인 확인이 끝나기 전에 부르지 않으려고 둔다(`app/(main)/layout.tsx`) */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>(apiUrl.me),
    enabled,
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name: string }) => api.patch<Me>(apiUrl.me, patch),
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

/**
 * 비밀번호 바꾸기. **로그인은 이어진다** — 서버가 새 토큰을 주고 refresh 쿠키도 새로 심는다.
 * 다른 기기의 로그인만 끊긴다.
 */
export function useChangePassword() {
  const setToken = useAuthStore((s) => s.setToken);
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api.post<{ access_token: string }>(apiUrl.changePassword, body),
    onSuccess: ({ access_token }) => setToken(access_token),
  });
}
