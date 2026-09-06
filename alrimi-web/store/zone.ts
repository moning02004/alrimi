import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ZoneState {
  /** null = 전체. 목록을 좁히는 용도 */
  selectedZoneId: number | null;
  /** 등록 폼의 기본 공간. 마지막에 쓴 공간을 기억한다 */
  lastUsedZoneId: number | null;
  selectZone: (zoneId: number | null) => void;
  setLastUsedZone: (zoneId: number) => void;
}

export const useZoneStore = create<ZoneState>()(
  persist(
    (set) => ({
      selectedZoneId: null,
      lastUsedZoneId: null,
      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
      setLastUsedZone: (zoneId) => set({ lastUsedZoneId: zoneId }),
    }),
    { name: "alrimi-zone" },
  ),
);
