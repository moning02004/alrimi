"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { useZoneMark, useZones } from "@/hooks/useZones";
import { ZoneMark } from "@/components/ZoneMark";
import { ZoneCreateSheet } from "@/components/ZoneCreateSheet";
import { ZoneEditSheet } from "@/components/ZoneEditSheet";
import { NameSheet, PasswordSheet } from "@/components/AccountSheets";
import { SubscribeSheet } from "@/components/SubscribeSheet";
import { useMe } from "@/hooks/useMe";
import type { Zone } from "@/types";

export default function SettingsPage() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const { zones } = useZones();
  const markOf = useZoneMark();
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [sheet, setSheet] = useState<"zone" | "name" | "password" | "subscribe" | null>(null);

  const { data: me } = useMe();

  /**
   * 딥링크를 눌러본 뒤, 앱이 열렸는지 지켜본다.
   *
   * `ntfy://` 는 핸들러가 없으면 조용히 실패한다 — 눌렀는데 아무 일도 안 일어나면
   * 고장으로 읽힌다. 앱이 열리면 이 탭이 가려지므로, 잠시 뒤에도 그대로 보이면
   * 실패로 보고 QR 을 내준다.
   *
   * 판정에 걸리는 그 1.2초 동안 화면이 그대로면 누른 반응이 없는 것으로 읽히므로,
   * 시트는 누르는 즉시 열고 QR 자리만 자리표시로 채운 채 결과를 기다린다.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [subscribePhase, setSubscribePhase] = useState<"opening" | "fallback">("opening");

  const subscribe = () => {
    const url = me?.ntfy_subscribe_url;
    if (!url) return;

    if (timer.current) clearTimeout(timer.current);
    setSubscribePhase("opening");
    setSheet("subscribe");

    // 딥링크는 시트가 한 번 그려진 뒤에 던진다. 앱 선택 대화상자가 뜨면서
    // 렌더가 밀리면 시트가 열리는 모습이 통째로 잘린다
    requestAnimationFrame(() => {
      window.location.href = url;
      timer.current = setTimeout(() => setSubscribePhase("fallback"), 1200);
    });
  };

  const closeSheet = () => {
    if (timer.current) clearTimeout(timer.current);
    setSheet(null);
  };

  /**
   * 앱이 열렸다면 이 탭이 가려진다 — 판정을 접고 시트도 닫는다. 그래야 구독을
   * 마치고 돌아왔을 때 "열리지 않았어요" 가 남아 있지 않다.
   *
   * 이미 QR 을 내준 뒤라면 지켜보지 않는다. 그때 탭이 가려지는 건 대개 QR 을
   * 찍으러 카메라를 여는 것이라, 돌아왔을 때 QR 이 사라져 있으면 곤란하다.
   */
  useEffect(() => {
    if (sheet !== "subscribe" || subscribePhase !== "opening") return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      if (timer.current) clearTimeout(timer.current);
      setSheet(null);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [sheet, subscribePhase]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const logout = async () => {
    await api.delete(apiUrl.revokeToken).catch(() => undefined);
    clear();
    router.replace(pageUrl.login);
  };

  const rowCls = "flex items-center justify-between px-4 py-3";
  const groupCls = "divide-y divide-line rounded-2xl border border-line bg-card";
  const headCls = "px-1 pb-2 pt-5 text-xs font-medium text-muted";

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <h1 className="text-base font-semibold">설정</h1>
      </header>

      <main className="px-4 pb-4">
        <p className={headCls}>공간</p>
        <div className={groupCls}>
          {zones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => setEditingZone(zone)}
              className={`${rowCls} w-full text-left`}
            >
              <div className="flex items-center gap-2.5">
                <ZoneMark mark={markOf(zone.id)?.mark ?? ""} color={zone.color} />
                <div>
                  <p className="text-sm font-medium">{zone.name}</p>
                </div>
              </div>
              <span className="text-xs text-muted">수정 ›</span>
            </button>
          ))}
          <div className="px-4 py-3">
            <button onClick={() => setSheet("zone")} className="text-sm text-pine">
              + 공간 추가
            </button>
          </div>
        </div>

        <p className={headCls}>알림</p>
        <div className={groupCls}>
          {/*
            토픽이 16진수라 손으로 옮겨 적을 수 없다. 이 링크를 누르면 ntfy 앱이
            열리면서 구독까지 끝난다 — 그래서 토픽 자체는 화면에 두지 않았다.
            (안드로이드 기준. iOS 앱은 이 링크를 지원하지 않을 수 있다.)
          */}
          <button
            onClick={subscribe}
            disabled={!me?.ntfy_subscribe_url}
            className={`${rowCls} w-full text-left disabled:opacity-60`}
          >
            <div>
              <p className="text-sm">알림 구독하기</p>
              <p className="mt-0.5 text-xs text-muted">누르면 ntfy 앱이 열리면서 등록돼요</p>
            </div>
            <span className="text-xs text-muted">›</span>
          </button>
        </div>

        <p className={headCls}>계정</p>
        <div className={groupCls}>
          <button onClick={() => setSheet("name")} className={`${rowCls} w-full text-left`}>
            <p className="text-sm">{me?.name || me?.username}</p>
            <span className="text-xs text-muted">이름 변경 ›</span>
          </button>
          <button onClick={() => setSheet("password")} className={`${rowCls} w-full text-left`}>
            <p className="text-sm">비밀번호 변경</p>
            <span className="text-xs text-muted">›</span>
          </button>
          <div className="px-4 py-3">
            <button onClick={logout} className="text-sm text-red-600">
              로그아웃
            </button>
          </div>
        </div>

        <p className={headCls}>앱</p>
        <div className={groupCls}>
          <div className={rowCls}>
            <p className="text-sm text-muted">버전</p>
            <span className="text-xs text-muted">{me?.version ?? "—"}</span>
          </div>
        </div>
      </main>

      <ZoneCreateSheet
        open={sheet === "zone"}
        onClose={() => setSheet(null)}
        // 색까지 바로 고를 수 있게 만든 공간의 수정 시트로 이어준다
        onCreated={setEditingZone}
      />
      <ZoneEditSheet zone={editingZone} onClose={() => setEditingZone(null)} />
      <NameSheet me={me} open={sheet === "name"} onClose={() => setSheet(null)} />
      <PasswordSheet
        open={sheet === "password"}
        onClose={() => setSheet(null)}
        onChanged={() => {
          setSheet(null);
          clear();
          router.replace(pageUrl.login);
        }}
      />
      <SubscribeSheet
        me={me}
        open={sheet === "subscribe"}
        phase={subscribePhase}
        onClose={closeSheet}
      />
    </>
  );
}
