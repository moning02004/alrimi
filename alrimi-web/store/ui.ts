import { create } from "zustand";

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
