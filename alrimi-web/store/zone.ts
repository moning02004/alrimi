import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ZoneScope } from "@/types";

interface ZoneState {
  /** null = 전체. 내 공간 하나(`zone:3`) 또는 보여주는 사람 한 명(`owner:11`) */
  scope: ZoneScope;
  setScope: (scope: ZoneScope) => void;
}

export const useZoneStore = create<ZoneState>()(
  persist(
    (set) => ({
      scope: null,
      setScope: (scope) => set({ scope }),
    }),
    // 이름을 바꾼 것은 예전 값(공간 id 숫자)이 새 모양으로 읽히지 않게 하려는 것이다
    { name: "alrimi-scope" },
  ),
);
