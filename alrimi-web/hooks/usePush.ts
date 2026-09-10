"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import { currentSubscription, iosNeedsInstall, pushSupported, subscribe } from "@/lib/push";

interface PushKey {
  public_key: string | null;
  enabled: boolean;
}

/**
 * 이 기기에서 알림을 받을 수 있는지, 지금 받고 있는지.
 *
 * - `unsupported` 브라우저에 푸시 기능이 없다 (iOS 사파리 탭 포함)
 * - `install`     iOS 인데 홈 화면에 추가하지 않았다 — 사람이 할 수 있는 일이 있다
 * - `off`         서버에 키가 없다. 알림 받기 자리를 아예 내주지 않는다
 * - `denied`      거절당했다. 브라우저 설정에서 풀어야 하고 다시 물을 수 없다
 * - `on` / `idle` 켜져 있다 / 켤 수 있다
 */
export type PushState = "loading" | "unsupported" | "install" | "off" | "denied" | "idle" | "on";

export function usePush() {
  const { data: key, isPending } = useQuery({
    queryKey: ["push-key"],
    queryFn: () => api.get<PushKey>(apiUrl.pushKey),
    // 서버 키는 바뀌지 않는다(바뀌면 구독이 전부 죽으므로 바꾸지 않는다)
    staleTime: Infinity,
  });

  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * 이 기기의 구독을 서버에 다시 등록한다.
   *
   * 켤 때만이 아니라 앱을 열 때마다 한 번씩 한다. 브라우저는 구독을 말없이
   * 갈아치우는 일이 있고(pushsubscriptionchange), 그 순간에는 로그인 정보가 없는
   * 서비스 워커만 깨어 있어서 우리 대신 알릴 수가 없다. 서버 쪽은 endpoint 로
   * 덮어쓰므로 여러 번 보내도 늘지 않는다.
   */
  const sync = useCallback(async (subscription: PushSubscription) => {
    await api.post(apiUrl.pushSubscriptions, subscription.toJSON());
  }, []);

  // 이 기기가 지금 구독을 들고 있는지 확인하고, 있으면 서버와 맞춰둔다
  useEffect(() => {
    // 못 쓰는 브라우저면 확인할 것도 없다. 상태에 적어두지 않는 것은 아래 계산이
    // 지원 여부를 먼저 보기 때문이다 — 여기서 setState 를 하면 렌더가 한 번 더 돈다.
    if (!pushSupported()) return;

    let alive = true;
    currentSubscription().then((subscription) => {
      if (!alive) return;
      setSubscribed(!!subscription);
      // 권한이 살아 있는 구독만 되보낸다. 권한을 껐다면 곧 죽을 구독이다.
      if (subscription && Notification.permission === "granted") {
        sync(subscription).catch(() => undefined);
      }
    });
    return () => {
      alive = false;
    };
  }, [sync]);

  const state: PushState = (() => {
    /*
      지원 여부를 맨 먼저 본다. 서버에서는 늘 "지원 안 함" 이지만, 이 화면은 인증
      부트스트랩이 끝난 뒤에만 그려지므로(`app/(main)/layout.tsx`) 브라우저에서만
      마운트된다 — 서버가 그린 것과 어긋날 자리가 없다.
    */
    if (!pushSupported()) return iosNeedsInstall() ? "install" : "unsupported";
    if (isPending || subscribed === null) return "loading";
    if (!key?.enabled || !key.public_key) return "off";
    if (subscribed) return "on";
    // 거절은 구독이 없을 때만 말이 된다. 이미 켠 사람에게 "거절됨" 을 보이면
    // 자기가 뭘 잘못했나 싶어진다.
    if (Notification.permission === "denied") return "denied";
    return "idle";
  })();

  /**
   * 켠다. 권한 창은 이 안에서 뜬다 — 사람이 버튼을 누른 흐름에서만 물어야 한다
   * (화면을 열자마자 묻는 창은 대개 거절당하고, 거절은 되돌릴 수 없다).
   */
  const enable = useCallback(async () => {
    if (!key?.public_key) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // 거절·닫음. 상태는 아래 setSubscribed(false) 로 다시 읽힌다
        setSubscribed(false);
        return;
      }
      const subscription = await subscribe(key.public_key);
      await sync(subscription);
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }, [key, sync]);

  /**
   * 끈다. 브라우저의 구독을 먼저 버리고 서버에도 알린다.
   *
   * 순서가 중요하다 — 서버부터 지우면, 구독 해지가 실패했을 때 이 기기는 알림을
   * 받을 수 있는 채로 서버에서는 없는 것이 된다. 반대로는 최악이 "죽은 구독이
   * 서버에 잠깐 남는" 것이고, 그건 첫 발송에서 저절로 정리된다.
   */
  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await api.delete(apiUrl.pushSubscriptions, { endpoint: subscription.endpoint });
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  /** 시험 알림. 권한을 켜도 방해금지·집중모드가 따로 막을 수 있어 한 번 받아봐야 안다 */
  const test = useCallback(() => api.post<{ delivered: number }>(apiUrl.pushTest), []);

  return { state, busy, enable, disable, test };
}
