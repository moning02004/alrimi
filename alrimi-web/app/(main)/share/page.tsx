"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pageUrl } from "@/constants/routeUrl";
import { LoadingScreen } from "@/components/Loading";

/**
 * 공유로 들어오는 문. 서비스 워커가 `POST /share` 를 받아 여기로 넘긴다(`public/sw.js`).
 *
 * **이 화면은 아무것도 꺼내지 않는다.** 넘어온 글을 꺼내 폼을 여는 일은 앱 레이아웃이
 * 맡는다(`useSharedDraft`) — 로그인이 풀린 채 공유하면 이 화면은 그려지지도 못하고
 * 로그인으로 넘어가는데, 그때도 글은 살아 있어야 하기 때문이다.
 *
 * 그래서 여기서 하는 일은 홈으로 비켜서는 것뿐이다. 주소에 `/share` 가 남으면 새로고침할
 * 때마다 "공유를 받는 중" 인 화면으로 돌아온다.
 */
export default function SharePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(pageUrl.home);
  }, [router]);

  return <LoadingScreen label="받는 중" />;
}
