import { create } from "zustand";

interface AuthState {
  token: string | null;
  ready: boolean; // 부트스트랩(자동 로그인 시도) 완료 여부
  setToken: (token: string) => void;
  setReady: (ready: boolean) => void;
  clear: () => void;
}

/**
 * access 토큰은 메모리에만 둔다.
 * refresh 토큰은 httpOnly 쿠키라 JS가 건드리지 않는다.
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  ready: false,
  setToken: (token) => set({ token }),
  setReady: (ready) => set({ ready }),
  clear: () => set({ token: null }),
}));
