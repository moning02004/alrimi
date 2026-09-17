import { create } from "zustand";

interface AuthState {
  token: string | null;
  ready: boolean; // 부트스트랩(자동 로그인 시도) 완료 여부
  /**
   * 연결이 없어 로그인을 확인하지 못한 채, 이 기기에 남겨둔 일정으로 보고 있다
   * (`lib/offlineCache.ts`). 토큰은 없다 — 읽기 전용이고, 연결되면 다시 확인한다.
   */
  offline: boolean;
  setToken: (token: string) => void;
  setReady: (ready: boolean) => void;
  setOffline: (offline: boolean) => void;
  clear: () => void;
}

/**
 * access 토큰은 메모리에만 둔다.
 * refresh 토큰은 httpOnly 쿠키라 JS가 건드리지 않는다.
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  ready: false,
  offline: false,
  // 토큰을 받았다는 것은 연결됐다는 뜻이다
  setToken: (token) => set({ token, offline: false }),
  setReady: (ready) => set({ ready }),
  setOffline: (offline) => set({ offline }),
  clear: () => set({ token: null, offline: false }),
}));
