"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import { useZoneStore } from "@/store/zone";
import { zoneMarks } from "@/lib/zone";
import type { Zone } from "@/types";

export function useZones() {
  const { selectedZoneId, selectZone } = useZoneStore();

  const query = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.get<Zone[]>(apiUrl.zones),
  });

  // query.data가 없을 때 매 렌더 새 배열을 만들면 아래 useEffect가 계속 돈다
  const zones = useMemo(() => query.data ?? [], [query.data]);

  // 고른 공간이 지워졌으면 전체로 되돌린다
  useEffect(() => {
    if (!query.data || selectedZoneId === null) return;
    if (!zones.some((z) => z.id === selectedZoneId)) selectZone(null);
  }, [query.data, zones, selectedZoneId, selectZone]);

  const selected = zones.find((z) => z.id === selectedZoneId) ?? null;
  // 등록 폼의 기본 공간. 필터로 좁혀 둔 공간이 있으면 보고 있던 그대로 이어서 쓰고,
  // 전체를 보고 있으면 고를 근거가 없으므로 맨 앞 공간으로 둔다.
  const defaultZone = selected ?? zones[0] ?? null;

  return { ...query, zones, selectedZoneId, selected, defaultZone, selectZone };
}

/**
 * 공간 id 로 표시(머리글자·색·이름)를 찾는다.
 *
 * 머리글자는 공간 목록 전체를 봐야 정해진다(겹치면 두 글자로 늘린다). 카드마다
 * 따로 계산하면 같은 공간이 화면에서 다른 글자로 보일 수 있으므로 한곳에서 만든다.
 */
export function useZoneMark() {
  const { zones } = useZones();

  return useMemo(() => {
    const marks = zoneMarks(zones);
    const byId = new Map(zones.map((zone) => [zone.id, zone]));

    return (zoneId: number) => {
      const zone = byId.get(zoneId);
      // 목록보다 카드가 먼저 그려질 수 있다. 그때는 색만으로 버틴다.
      if (!zone) return null;
      return { mark: marks.get(zone.id) ?? "", color: zone.color, name: zone.name };
    };
  }, [zones]);
}

/** 고를 수 있는 색. 서버가 정하고 웹은 견본만 그린다 */
export function usePalette() {
  return useQuery({
    queryKey: ["palette"],
    queryFn: () => api.get<{ colors: string[] }>(apiUrl.palette),
    staleTime: Infinity,
  });
}

export function useUpdateZone(zoneId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; color?: string }) =>
      api.patch<Zone>(apiUrl.zone(zoneId), patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zones"] });
      // 카드 막대와 달력 띠가 존 색을 쓰므로 같이 새로 그린다
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

/**
 * 공간을 지운다. 그 안의 일정과 예약된 알림도 서버에서 함께 사라지므로(CASCADE)
 * 목록·달력까지 다시 받는다. 지운 공간을 필터로 잡고 있었다면 `useZones` 가
 * 전체로 되돌린다.
 */
export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (zoneId: number) => api.delete<void>(apiUrl.zone(zoneId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zones"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Zone>(apiUrl.zones, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zones"] }),
  });
}
