"use client";

import { useSyncExternalStore } from "react";

/**
 * CSS 로 감출 수 없는 것 — 아예 다른 화면을 그리거나, 폭에 따라 다른 요청을
 * 보내야 할 때 쓴다. 단순히 보이고 안 보이는 차이라면 `lg:hidden` 쪽이 낫다
 * (자바스크립트가 돌기 전에도 맞게 그려진다).
 *
 * 서버에서는 항상 `false` 다. 이 앱은 인증 부트스트랩이 끝날 때까지 화면을
 * 그리지 않으므로, 이 훅을 쓰는 자리는 이미 브라우저에서만 마운트된다.
 */
function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind 의 `lg` 와 같은 경계. 옆 기둥·2단 달력이 여기서 갈린다 */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
