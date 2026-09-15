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
 *
 * 들고 있던 내 정보의 "비밀번호를 바꿔주세요" 표시도 여기서 내린다. 그러면 첫 로그인의
 * 강제 변경 화면(`PasswordChangeRequired`)이 저절로 앱으로 바뀐다 — 다시 불러와 확인할
 * 것 없이, 방금 성공한 요청이 곧 그 사실이다.
 */
export function useChangePassword() {
  const qc = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api.post<{ access_token: string }>(apiUrl.changePassword, body),
    onSuccess: ({ access_token }) => {
      setToken(access_token);
      qc.setQueryData<Me>(["me"], (me) => (me ? { ...me, must_change_password: false } : me));
    },
  });
}
