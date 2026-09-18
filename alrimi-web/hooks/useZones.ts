"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import { useZoneStore } from "@/store/zone";
import { listLabel, sharersOf, zoneMarks, type Sharer } from "@/lib/zone";
import type { UserSummary, Zone } from "@/types";

export function useZones() {
  const { scope, setScope } = useZoneStore();

  const query = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.get<Zone[]>(apiUrl.zones),
  });

  // query.data가 없을 때 매 렌더 새 배열을 만들면 아래 useEffect가 계속 돈다
  const zones = useMemo(() => query.data ?? [], [query.data]);
  const sharers = useMemo(() => sharersOf(zones), [zones]);

  const [kind, rawId] = scope ? scope.split(":") : [null, null];
  const scopeId = rawId ? Number(rawId) : null;
  /** 공간 하나로 좁혔을 때 그 공간 */
  const selected = kind === "zone" ? (zones.find((z) => z.id === scopeId) ?? null) : null;
  /** 사람 한 명으로 좁혔을 때 그 사람(받은 공간의 주인) */
  const selectedSharer = kind === "owner" ? (sharers.find((s) => s.id === scopeId) ?? null) : null;

  // 고른 공간이 지워졌거나 그 사람이 더는 보여주지 않으면 전체로 되돌린다
  useEffect(() => {
    if (!query.data || scope === null) return;
    if (!selected && !selectedSharer) setScope(null);
  }, [query.data, scope, selected, selectedSharer, setScope]);

  /*
    일정을 넣을 수 있는 공간 — 내 공간과, 받았는데 주인이 "함께 보는 사람도 일정 추가·수정" 을
    켜둔 공간. 등록 폼에는 이것만 나온다. 서버도 그 밖의 공간에 넣는 것을 막는다.
  */
  const writableZones = useMemo(() => zones.filter((zone) => zone.writable), [zones]);
  // 등록 폼의 기본 공간. 필터로 좁혀 둔 공간이 있으면 보고 있던 그대로 이어서 쓰고,
  // 사람으로 좁혔으면 그 사람의 고칠 수 있는 공간, 아니면 내 공간 맨 앞이다.
  const defaultZone =
    (selected?.writable ? selected : null) ??
    (selectedSharer ? writableZones.find((zone) => zone.owner_id === selectedSharer.id) : null) ??
    writableZones.find((zone) => zone.role === "owner") ??
    writableZones[0] ??
    null;

  return {
    ...query,
    zones,
    sharers,
    writableZones,
    scope,
    setScope,
    selected,
    selectedSharer,
    defaultZone,
  };
}

/** 사람 딱지의 색. 공간 색과 겹치지 않는 중립색이고, 모양(동그라미)으로도 공간과 갈린다 */
export const SHARER_COLOR = "#6B7B87";

/**
 * 공간 id 로 표시(머리글자·색·이름)를 찾는다.
 *
 * **받은 공간의 일정은 공간이 아니라 사람 딱지다** — 칩이 사람마다 하나라, 카드도 같은 딱지를
 * 써야 칩이 범례가 된다. 어느 공간인지는 카드가 제목 앞에 `[공간 이름]` 으로 적는다.
 *
 * 머리글자는 목록 전체를 봐야 정해진다(겹치면 두 글자로 늘린다). 카드마다 따로 계산하면
 * 같은 공간이 다른 글자로 보일 수 있으므로 한곳에서 만든다. 공간 딱지와 사람 딱지는
 * 모양이 달라 따로 센다.
 */
export function useZoneMark() {
  const { zones, sharers } = useZones();

  return useMemo(() => {
    const zoneMarkById = zoneMarks(zones.filter((zone) => zone.role === "owner"));
    const sharerMarks = sharerMarksOf(sharers);
    const byId = new Map(zones.map((zone) => [zone.id, zone]));

    return (zoneId: number) => {
      const zone = byId.get(zoneId);
      // 목록보다 카드가 먼저 그려질 수 있다. 그때는 색만으로 버틴다.
      if (!zone) return null;
      const received = zone.role === "member";
      return {
        /** 받은 공간이면 사람 딱지다 */
        received,
        mark: received ? (sharerMarks.get(zone.owner_id) ?? "") : (zoneMarkById.get(zone.id) ?? ""),
        color: received ? SHARER_COLOR : zone.color,
        /** 공간 이름 — 받은 공간 카드가 제목 앞에 적는다 */
        zoneName: zone.name,
        /** 누구의 어느 공간인지. 낭독 이름·상세 표시 */
        label: listLabel(zone),
        shared: received || zone.shared,
      };
    };
  }, [zones, sharers]);
}

/** 사람 딱지 머리글자. 공간 딱지와 같은 규칙(겹치면 갈라지는 글자)을 사람 이름에 쓴다 */
export function sharerMarksOf(sharers: Sharer[]): Map<number, string> {
  return zoneMarks(sharers.map((sharer) => ({ id: sharer.id, name: sharer.name }) as Zone));
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
    mutationFn: (patch: { name?: string; color?: string; shared?: boolean; viewers_can_edit?: boolean }) =>
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

/** 공간을 만든다. 함께 보기를 켜고 만들면 처음부터 함께 보는 사람들에게 보인다 */
/**
 * 이 공간의 알림을 끄고 켠다. 보는 것과 받는 것은 다르다 — 목록·달력에는 그대로 남는다.
 *
 * 공간 목록에만 영향이 있으므로 일정·달력은 다시 받지 않는다.
 */
export function useMuteZone(zoneId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) =>
      muted
        ? api.post<{ muted: boolean }>(apiUrl.zoneMute(zoneId))
        : api.delete<{ muted: boolean }>(apiUrl.zoneMute(zoneId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zones"] }),
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      shared = false,
      viewersCanEdit = false,
    }: {
      name: string;
      shared?: boolean;
      viewersCanEdit?: boolean;
    }) => api.post<Zone>(apiUrl.zones, { name, shared, viewers_can_edit: viewersCanEdit }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zones"] }),
  });
}

/** 내 공간을 함께 보는 사람들 */
export function useSharing() {
  return useQuery({
    queryKey: ["sharing"],
    queryFn: () => api.get<UserSummary[]>(apiUrl.sharing),
  });
}

/** 찾기에서 고른 사람을 더한다. 서버가 더한 뒤의 전체 목록을 준다 */
export function useAddSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.post<UserSummary[]>(apiUrl.sharing, { user_id: userId }),
    onSuccess: (people) => qc.setQueryData(["sharing"], people),
  });
}

/** 그 사람에게 더는 내 공간을 보여주지 않는다 */
export function useRemoveSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.delete<void>(apiUrl.sharingPerson(userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sharing"] }),
  });
}

/** 나에게 공간을 보여주는 사람들 */
export function useReceivedSharing() {
  return useQuery({
    queryKey: ["sharing", "received"],
    queryFn: () => api.get<UserSummary[]>(apiUrl.sharingReceived),
  });
}

/**
 * 그 사람의 공간을 그만 본다. 그 사람의 공간·일정이 목록·달력에서 통째로 빠지므로
 * 전부 다시 받는다.
 */
export function useLeaveSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ownerId: number) => api.delete<void>(apiUrl.sharingReceivedPerson(ownerId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sharing"] });
      qc.invalidateQueries({ queryKey: ["zones"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

/**
 * 함께 볼 사람 찾기. 입력을 잠깐 멈춘 뒤의 말을 받는다(`PeoplePicker`).
 * 빈 말로는 부르지 않는다 — 서버도 빈 말에는 아무도 주지 않는다.
 */
export function useUserSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["user-search", term],
    queryFn: () => api.get<UserSummary[]>(apiUrl.userSearch(term)),
    enabled: term.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}
