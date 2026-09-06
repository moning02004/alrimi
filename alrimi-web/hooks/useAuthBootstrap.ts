"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_HOST, apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";

/**
 * 새로고침 시 refresh 쿠키로 자동 로그인을 한 번 시도하고,
 * 실패하면 로그인 화면으로 보낸다.
 */
export function useAuthBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, ready, setToken, setReady } = useAuthStore();

  useEffect(() => {
    if (ready) return;

    (async () => {
      try {
        const res = await fetch(API_HOST + apiUrl.refreshToken, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { access_token: string };
          setToken(data.access_token);
        }
      } finally {
        setReady(true);
      }
    })();
  }, [ready, setToken, setReady]);

  useEffect(() => {
    if (!ready) return;
    if (!token && pathname !== pageUrl.login) router.replace(pageUrl.login);
  }, [ready, token, pathname, router]);

  return { ready, authenticated: Boolean(token) };
}
