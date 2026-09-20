"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { pageUrl } from "@/constants/routeUrl";
import { refreshSession } from "@/lib/api";
import { forgetOfflineCache, hasOfflineCache } from "@/lib/offlineCache";
import { useAuthStore } from "@/store/auth";

type RefreshOutcome = "ok" | "denied" | "unreachable";

/**
 * 재발급은 `lib/api.ts` 의 한 곳만 부른다. 여기서 따로 부르면 같은 쿠키로 두 번 나가는데,
 * 서버가 재발급마다 쿠키를 새것으로 바꾸므로(회전) 뒤의 것이 거절당한다.
 */
async function tryRefresh(): Promise<RefreshOutcome> {
  const result = await refreshSession();
  if (result === "unreachable") return "unreachable";
  return result === null ? "denied" : "ok";
}

/**
 * 새로고침 시 refresh 쿠키로 자동 로그인을 한 번 시도하고,
 * 실패하면 로그인 화면으로 보낸다.
 *
 * **연결이 없으면 로그인 화면으로 보내지 않는다.** 이 기기에 받아둔 일정이 있으면
 * 오프라인 보기로 연다(`offline`). 로그인 화면으로 보내봐야 연결이 없어 로그인도 못
 * 하고, 정작 보려던 내일 준비물은 기기 안에 있다. 연결이 돌아오면 다시 확인한다.
 *
 * **거절당하면(쿠키 만료) 남겨둔 것도 지운다.** 로그인이 풀린 기기에 앞사람 일정이
 * 남아 있으면, 다음에 로그인한 사람이 그것을 먼저 보게 된다.
 */
export function useAuthBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const { token, ready, offline, setReady, setOffline } = useAuthStore();

  useEffect(() => {
    if (ready) return;

    (async () => {
      const result = await tryRefresh();
      if (result === "unreachable" && hasOfflineCache()) {
        setOffline(true);
        // 브라우저는 연결됐다고 믿는데 서버에 못 닿는 경우가 있다(와이파이 로그인 화면 등).
        // 그대로 두면 쿼리들이 다시 받으려다 실패해 받아둔 목록 대신 오류가 뜬다.
        onlineManager.setOnline(false);
      }
      if (result === "denied") {
        forgetOfflineCache();
        client.clear();
      }
      setReady(true);
    })();
  }, [ready, setReady, setOffline, client]);

  // 오프라인 보기 중에 연결이 돌아왔다. 로그인을 다시 확인하고 받아둔 것을 새로 받는다.
  useEffect(() => {
    if (!offline) return;

    const onOnline = async () => {
      const result = await tryRefresh();
      if (result === "ok") {
        onlineManager.setOnline(true);
        client.invalidateQueries();
      } else if (result === "denied") {
        forgetOfflineCache();
        client.clear();
        useAuthStore.getState().clear();
      }
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [offline, client]);

  useEffect(() => {
    if (!ready) return;
    if (!token && !offline && pathname !== pageUrl.login) router.replace(pageUrl.login);
  }, [ready, token, offline, pathname, router]);

  return { ready, authenticated: Boolean(token) || offline, offline };
}
