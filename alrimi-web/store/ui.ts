import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventListItem } from "@/types";

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

interface ZoneSheetState {
  /** 공간을 바꾸는 중인 일정. null 이면 시트가 닫혀 있다 */
  event: EventListItem | null;
  openFor: (event: EventListItem) => void;
  close: () => void;
}

/**
 * 목록 카드의 공간 딱지를 눌렀을 때 뜨는 시트.
 *
 * 카드가 아니라 여기에 두는 것은, 시트를 화면에 **하나만** 두기 위해서다
 * (`app/(main)/layout.tsx`). 카드마다 달면 목록에 있는 카드 수만큼 시트가 생긴다.
 */
export const useZoneSheet = create<ZoneSheetState>((set) => ({
  event: null,
  openFor: (event) => set({ event }),
  close: () => set({ event: null }),
}));

interface SelectionState {
  /** 고르는 중인가. 켜지면 카드가 여는 자리가 아니라 고르는 자리가 된다 */
  active: boolean;
  ids: number[];
  start: () => void;
  stop: () => void;
  toggle: (eventId: number) => void;
}

/**
 * 여러 개를 골라 한 번에 지우는 자리. 홈 목록과 지난 일정/보류가 같은 것을 쓴다.
 *
 * **화면을 옮기면 꺼야 한다**(`stop`). 고르다 만 채로 다른 목록에 가면, 거기 있는
 * 카드들이 까닭 없이 고르는 자리가 되어 있고 고른 것은 저 화면에 있다.
 */
export const useSelection = create<SelectionState>((set) => ({
  active: false,
  ids: [],
  start: () => set({ active: true, ids: [] }),
  stop: () => set({ active: false, ids: [] }),
  toggle: (eventId) =>
    set((s) => ({
      ids: s.ids.includes(eventId) ? s.ids.filter((id) => id !== eventId) : [...s.ids, eventId],
    })),
}));
