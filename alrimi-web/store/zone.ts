import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ZoneState {
  /**
   * 목록·달력에서 **빼둔** 공간들. 고른 것이 아니라 끈 것을 적는다 — 처음에는 전부 켜져
   * 있어야 하고, 나중에 공간을 새로 만들면 그것도 저절로 켜진 채여야 한다. 고른 것을 적으면
   * 새 공간이 꺼진 채로 생겨서 "왜 안 보이지" 가 된다.
   */
  hiddenZoneIds: number[];
  toggleZone: (zoneId: number, on: boolean) => void;
  /** 여러 개를 한꺼번에 (사람 줄 하나가 그 사람의 공간 전부를 켜고 끈다) */
  toggleZones: (zoneIds: number[], on: boolean) => void;
  showAll: () => void;
  hideAll: (zoneIds: number[]) => void;
}

export const useZoneStore = create<ZoneState>()(
  persist(
    (set) => ({
      hiddenZoneIds: [],
      toggleZone: (zoneId, on) =>
        set((s) => ({
          hiddenZoneIds: on
            ? s.hiddenZoneIds.filter((id) => id !== zoneId)
            : [...s.hiddenZoneIds, zoneId],
        })),
      toggleZones: (zoneIds, on) =>
        set((s) => ({
          hiddenZoneIds: on
            ? s.hiddenZoneIds.filter((id) => !zoneIds.includes(id))
            : [...s.hiddenZoneIds.filter((id) => !zoneIds.includes(id)), ...zoneIds],
        })),
      showAll: () => set({ hiddenZoneIds: [] }),
      hideAll: (zoneIds) => set({ hiddenZoneIds: [...zoneIds] }),
    }),
    // 이름을 바꾼 것은 예전 값(공간 하나만 고르던 시절)이 새 모양으로 읽히지 않게 하려는 것이다
    { name: "alrimi-zone-filter" },
  ),
);
