"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { clearOnLogout } from "@/lib/session";
import { persistOfflineCache, restoreOfflineCache } from "@/lib/offlineCache";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: true,
        },
        mutations: {
          /*
            연결이 없어도 멈춰 기다리지 않고 바로 실패시킨다. 기본값(online)이면 오프라인에서
            누른 저장이 쌓였다가 연결되는 순간 한꺼번에 나간다 — 오프라인은 읽기 전용이다
            (`lib/api.ts` 가 "오프라인이라 저장하지 않았어요" 로 돌려준다).
          */
          networkMode: "always",
        },
      },
    });
    // 이 기기에 남겨둔 일정을 먼저 깐다. 연결이 되면 평소처럼 새로 받아 덮는다.
    restoreOfflineCache(queryClient);
    return queryClient;
  });

  // 로그아웃하면 캐시를 비운다. 안 비우면 다음에 로그인한 사람에게 앞사람 이름이 보인다
  useEffect(() => clearOnLogout(client), [client]);

  // 받은 것을 기기에 남긴다(오프라인 보기)
  useEffect(() => persistOfflineCache(client), [client]);

  /*
    서비스 워커는 알림을 켜지 않아도 등록한다 — 앱 껍데기(HTML·JS·CSS)를 받아두어야
    연결 없이도 앱이 열린다. 개발 서버에서는 등록하지 않는다: 저장할 때마다 바뀌는
    번들을 워커가 붙잡고 있으면 고친 것이 안 보인다.
  */
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-center" toastOptions={{ duration: 2200 }} />
    </QueryClientProvider>
  );
}
