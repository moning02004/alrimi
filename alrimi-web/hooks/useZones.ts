"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import { useZoneStore } from "@/store/zone";
import { zoneMarks } from "@/lib/zone";
import type { UserSummary, Zone, ZoneScope } from "@/types";

export function useZones() {
  const { hiddenZoneIds, toggleZone, showAll, hideAll } = useZoneStore();

  const query = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.get<Zone[]>(apiUrl.zones),
  });

  // query.data가 없을 때 매 렌더 새 배열을 만들면 아래 useMemo 들이 계속 돈다
  const zones = useMemo(() => query.data ?? [], [query.data]);

  /*
    지금 켜둔 공간들. 끈 것만 저장하므로(`store/zone.ts`) 새로 만든 공간은 저절로 켜져 있다.
    지워진 공간이 끈 목록에 남아 있어도 여기서 걸러져 셈에 끼지 않는다.
  */
  const hidden = useMemo(
    () => hiddenZoneIds.filter((id) => zones.some((zone) => zone.id === id)),
    [hiddenZoneIds, zones],
  );
  const selectedIds = useMemo(
    () => zones.filter((zone) => !hidden.includes(zone.id)).map((zone) => zone.id),
    [zones, hidden],
  );
  const allOn = hidden.length === 0;
  /** 하나라도 껐을 때만 조건을 보낸다 — 전부일 때 보내면 나중에 늘어난 공간이 빠진다 */
  const scope: ZoneScope = allOn ? null : selectedIds;

  /*
    일정을 넣을 수 있는 공간 — 내 공간과, 받았는데 주인이 "함께 보는 사람도 일정 추가·수정" 을
    켜둔 공간. 등록 폼에는 이것만 나온다. 서버도 그 밖의 공간에 넣는 것을 막는다.
  */
  const writableZones = useMemo(() => zones.filter((zone) => zone.writable), [zones]);
  /*
    등록 폼의 기본 공간. 하나만 켜두고 보는 중이면 그 공간을 이어서 쓰고, 아니면 내 공간
    맨 앞이다(받은 공간보다 내 것이 먼저다).
  */
  const onlyOne = selectedIds.length === 1 ? zones.find((zone) => zone.id === selectedIds[0]) : null;
  const defaultZone =
    (onlyOne?.writable ? onlyOne : null) ??
    writableZones.find((zone) => zone.role === "owner") ??
    writableZones[0] ??
    null;

  return {
    ...query,
    zones,
    writableZones,
    /** 서버에 보낼 필터. `null` 이면 전부다 */
    scope,
    hidden,
    selectedIds,
    allOn,
    toggleZone,
    showAll,
    hideAll,
    defaultZone,
  };
}

/**
 * 공간 id 로 표시(머리글자·색·이름)를 찾는다.
 *
 * **받은 공간도 내 공간과 똑같이 그린다** — 같은 네모 딱지에 그 공간의 색과 이름이다.
 * 누구의 것인지는 화면마다 적지 않는다. 달력을 볼 때 궁금한 것은 "무슨 일인가" 이고,
 * 누가 보여주는 공간인지는 내 정보에서 확인한다.
 *
 * 머리글자는 목록 전체를 봐야 정해진다(겹치면 두 글자로 늘린다). 카드마다 따로 계산하면
 * 같은 공간이 다른 글자로 보일 수 있으므로 한곳에서 만든다. 받은 공간도 같이 센다 —
 * 내 "어린이집" 과 받은 "어린이집" 이 같은 글자로 나오면 안 된다.
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
      return {
        /** 남이 보여주는 공간인가. 그리는 데는 안 쓰고, 할 수 있는 일을 가를 때만 본다 */
        received: zone.role === "member",
        mark: marks.get(zone.id) ?? "",
        color: zone.color,
        /** 공간 이름. 낭독 이름·상세 표시 */
        label: zone.name,
        shared: zone.role === "member" || zone.shared,
      };
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
