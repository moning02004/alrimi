import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AddSheetState {
  open: boolean;
  /** 달력에서 빈 날을 눌러 열면 그 날짜가 채워진 채 뜬다 */
  initialDate: string | null;
  openAdd: (initialDate?: string) => void;
  closeAdd: () => void;
}

export const useAddSheet = create<AddSheetState>((set) => ({
  open: false,
  initialDate: null,
  openAdd: (initialDate) => set({ open: true, initialDate: initialDate ?? null }),
  closeAdd: () => set({ open: false, initialDate: null }),
}));

interface SideNavState {
  /** PC 왼쪽 기둥을 아이콘만 남기고 접었는지 */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

/**
 * 접은 상태는 새로 고쳐도 남는다.
 *
 * 한 번 접은 사람은 본문을 넓게 보려고 접은 것이라, 페이지를 옮길 때마다 다시
 * 펴져 있으면 매번 같은 버튼을 누르게 된다. 저장한 값은 첫 그림 뒤에 들어오므로
 * 접힌 채로 들어와도 아주 잠깐은 펴진 모습이 보인다 — 공간 선택일 뿐 내용이
 * 달라지지 않아서 그냥 둔다(`store/zone.ts` 도 같은 방식이다).
 */
export const useSideNav = create<SideNavState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    { name: "alrimi-sidenav" },
  ),
);
