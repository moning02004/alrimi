"use client";

import { useSyncExternalStore } from "react";
import { LuWifiOff } from "react-icons/lu";
import { useAuthStore } from "@/store/auth";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** 브라우저가 연결이 없다고 아는가. 서버 렌더에서는 연결된 것으로 본다 */
export function useBrowserOffline() {
  return useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
}

/**
 * 오프라인 띠. 화면 맨 위에 선다.
 *
 * 목록은 그대로 보이는데 저장이 안 되면 고장으로 읽힌다. 지금 보는 것이 **받아둔 것**
 * 이고 고치는 것은 연결되면 된다는 것을 한 줄로 말해둔다.
 *
 * 두 경우를 함께 받는다: 브라우저가 연결이 없다고 알 때, 그리고 브라우저는 모르지만
 * 로그인을 확인하러 서버에 못 닿아 받아둔 것으로 연 때(`offline`).
 */
export function OfflineBanner() {
  const browserOffline = useBrowserOffline();
  const offline = useAuthStore((s) => s.offline);
  if (!browserOffline && !offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amberlt px-4 py-1.5 text-xs text-amber"
    >
      <LuWifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>오프라인이에요. 받아둔 일정을 보여드려요 · 등록·수정은 연결되면 할 수 있어요</span>
    </div>
  );
}
