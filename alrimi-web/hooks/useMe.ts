"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import type { Me } from "@/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>(apiUrl.me),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name: string }) => api.patch<Me>(apiUrl.me, patch),
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

/** 성공하면 서버가 refresh 쿠키를 지운다 — 다음 재발급이 막히므로 화면은 로그아웃으로 이어진다 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api.post<void>(apiUrl.changePassword, body),
  });
}
