import type { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { useZoneStore } from "@/store/zone";
import { forgetOfflineCache } from "./offlineCache";

/**
 * 로그인이 풀리면 받아둔 것을 전부 버린다. 돌려주는 함수로 구독을 푼다.
 *
 * 받아온 데이터(내 정보·공간·일정…)는 이 탭이 살아 있는 동안 캐시에 남는다. 로그아웃이
 * 토큰만 지우면, 새로고침 없이 다른 사람이 로그인했을 때 앞사람의 이름과 일정이 그대로
 * 보인다 — 새로 받아오기 전까지는 캐시가 먼저 그려지기 때문이다.
 *
 * 로그아웃 버튼마다 비우지 않고 **토큰이 사라지는 순간** 한곳에서 비운다. 토큰이
 * 사라지는 길이 여럿이라서다: 설정의 로그아웃, 비밀번호 변경 화면의 로그아웃, 재발급이
 * 실패해 저절로 풀리는 것(`lib/api.ts`). 한 곳이라도 빠뜨리면 그 길로 앞사람이 샌다.
 *
 * 토큰이 **다른 토큰으로** 바뀌는 것(재발급, 비밀번호 변경)은 같은 사람이라 비우지 않는다.
 */
export function clearOnLogout(client: QueryClient) {
  return useAuthStore.subscribe((state, prev) => {
    // 오프라인 보기(토큰 없이 남겨둔 것으로 보는 중)에서 풀린 것도 로그아웃이다
    const wasIn = Boolean(prev.token) || prev.offline;
    const isIn = Boolean(state.token) || state.offline;
    if (!wasIn || isIn) return;
    client.clear();
    // 기기에 남겨둔 일정도 앞사람 것이다(`lib/offlineCache.ts`)
    forgetOfflineCache();
    // 꺼둔 공간도 앞사람 것이다. localStorage 에 남아 다음 사람의 첫 화면을 좁힌다.
    useZoneStore.getState().showAll();
  });
}
