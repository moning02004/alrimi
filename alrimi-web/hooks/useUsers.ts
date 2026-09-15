"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import type { ManagedUser } from "@/types";

const key = ["users"];

/** 관리자가 아니면 부르지 않는다 — 서버가 403 을 주는 요청을 굳이 보내지 않는다 */
export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<ManagedUser[]>(apiUrl.users),
    enabled,
  });
}

/** 비밀번호는 보내지 않는다. 서버가 늘 0000 으로 만든다 */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; name: string }) =>
      api.post<ManagedUser>(apiUrl.users, body),
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
