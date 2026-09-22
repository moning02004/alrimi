"use client";

import { useEffect } from "react";
import {
  SHARE_CACHE,
  SHARE_KEY,
  SHARE_TTL_MS,
  draftFromShare,
  hasDraft,
  type SharedPayload,
} from "@/lib/share";
import { useAddSheet } from "@/store/ui";

/**
 * 다른 앱에서 공유로 넘어온 글이 있으면 등록 폼을 채워 연다.
 *
 * 서비스 워커가 `POST /share` 를 받아 남겨둔 것을 꺼낸다(`public/sw.js`). 꺼내는 자리를
 * `/share` 화면이 아니라 **앱 레이아웃**에 둔 것은 로그인 때문이다 — 로그인이 풀린 채
 * 공유하면 `/share` 는 그려지지도 못한 채 로그인 화면으로 넘어가고, 남겨둔 글은 아무도
 * 꺼내지 않은 채 남는다. 레이아웃에서 보면 로그인을 마치고 홈에 닿는 순간 열린다.
 *
 * 그래서 오래된 것은 버린다(`SHARE_TTL_MS`). 어제 공유한 것이 오늘 아침 홈에서 불쑥
 * 뜨면 그건 고장으로 읽힌다.
 *
 * **꺼내면 바로 지운다.** 남겨두면 다음에 홈에 올 때 또 열린다.
 */
export function useSharedDraft(enabled: boolean) {
  const openAdd = useAddSheet((s) => s.openAdd);

  useEffect(() => {
    if (!enabled || typeof caches === "undefined") return;
    let alive = true;

    (async () => {
      try {
        const cache = await caches.open(SHARE_CACHE);
        const stored = await cache.match(SHARE_KEY);
        if (!stored) return;
        await cache.delete(SHARE_KEY);
        if (!alive) return;

        const payload = (await stored.json()) as SharedPayload;
        if (payload.at && Date.now() - payload.at > SHARE_TTL_MS) return;

        const draft = draftFromShare(payload);
        if (!hasDraft(draft)) return;
        // 날짜는 비운 채로 연다 — 언제인지는 글이 아니라 사람이 안다
        openAdd(undefined, draft);
      } catch {
        // 캐시를 막아둔 브라우저도 있다. 공유가 안 될 뿐 앱은 그대로 돌아간다.
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled, openAdd]);
}
