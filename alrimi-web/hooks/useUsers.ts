"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import type { Invite, ManagedUser } from "@/types";

const key = ["users"];

/** 관리자가 아니면 부르지 않는다 — 서버가 403 을 주는 요청을 굳이 보내지 않는다 */
export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<ManagedUser[]>(apiUrl.users),
    enabled,
  });
}

/**
 * 비밀번호는 아무도 정하지 않는다. 서버가 초대 링크의 열쇠를 만들어 **이 응답에만** 실어
 * 준다 — 링크를 쓰는 사람이 자기 비밀번호를 정한다.
 */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; name: string }) =>
      api.post<ManagedUser & { invite: Invite }>(apiUrl.users, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/**
 * 비밀번호를 잊었거나 링크가 만료된 사람에게 새 링크를 준다. 앞의 링크는 그 자리에서
 * 죽지만, 쓰던 비밀번호는 링크를 실제로 쓰기 전까지 그대로 산다.
 */
export function useReissueInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Invite>(apiUrl.userInvite(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...roles }: { id: number; is_staff?: boolean; is_superuser?: boolean }) =>
      api.patch<ManagedUser>(apiUrl.user(id), roles),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(apiUrl.user(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
