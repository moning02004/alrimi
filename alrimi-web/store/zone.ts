import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ZoneState {
  /** null = 전체. 목록을 좁히면서 등록 폼의 기본 공간도 겸한다 */
  selectedZoneId: number | null;
  selectZone: (zoneId: number | null) => void;
}

export const useZoneStore = create<ZoneState>()(
  persist(
    (set) => ({
      selectedZoneId: null,
      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
    }),
    { name: "alrimi-zone" },
  ),
);
