"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, firstError } from "@/lib/api";
import Link from "next/link";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { useZoneMark, useZones } from "@/hooks/useZones";
import { ZoneMark } from "@/components/ZoneMark";
import { ZoneCreateSheet } from "@/components/ZoneCreateSheet";
import { ZoneEditSheet } from "@/components/ZoneEditSheet";
import { NameSheet, PasswordSheet } from "@/components/AccountSheets";
import { SubscribeSheet } from "@/components/SubscribeSheet";
import { useMe } from "@/hooks/useMe";
import { usePush } from "@/hooks/usePush";
import type { Zone } from "@/types";

// hover 는 `@media (hover:hover)` 안에서만 켜지므로 터치에서는 붙지 않는다
const rowCls = "flex items-center justify-between px-4 py-3 transition-colors hover:bg-paper";
const groupCls = "divide-y divide-line rounded-2xl border border-line bg-card";
const headCls = "px-1 pb-2 pt-5 text-xs font-medium text-muted";

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

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <h1 className="mx-auto w-full max-w-2xl text-base font-semibold">설정</h1>
      </header>

      {/* 목록을 읽는 화면이라 PC 에서도 넓히지 않는다 — 한 줄이 길수록 읽기 나쁘다 */}
      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
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
            길이 둘이다. 위는 이 브라우저로 바로 받는 것(웹 푸시), 아래는 ntfy 앱으로
            받는 것. 둘 다 켜면 둘 다 온다 — 하나가 막혀도 나머지로 닿으라고 나란히 둔다.
          */}
          <PushRow />

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
              <p className="text-sm">ntfy 앱으로 받기</p>
              <p className="mt-0.5 text-xs text-muted">누르면 ntfy 앱이 열리면서 등록돼요</p>
            </div>
            <span className="text-xs text-muted">›</span>
          </button>
        </div>

        {/*
          PC 는 옆 기둥에 "지난 일정" 이 있지만 모바일에는 그 자리가 없다.
          탭바를 넷으로 늘리면 가운데 등록 버튼이 가운데가 아니게 되므로 여기 둔다.
        */}
        <p className={headCls}>기록</p>
        <div className={groupCls}>
          <Link href={pageUrl.past} className={`${rowCls} w-full`}>
            <div>
              <p className="text-sm">지난 일정</p>
              <p className="mt-0.5 text-xs text-muted">끝난 일정도 지우지 않고 남겨둬요</p>
            </div>
            <span className="text-xs text-muted">›</span>
          </Link>
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


/**
 * 이 브라우저로 알림 받기 (웹 푸시).
 *
 * 켜고 끄는 것 말고 **시험 알림**을 같이 두는 까닭: 권한을 허용해도 실제로 뜨는지는
 * 한 번 받아봐야 안다. 방해금지·집중모드·시스템 알림 설정이 브라우저 권한과 따로
 * 놀아서, "허용했는데 안 온다" 가 흔하다. 진짜 일정이 올 때까지 기다려서 확인할
 * 수는 없으므로 여기서 한 번 밀어본다.
 *
 * 못 쓰는 자리에서는 버튼 대신 까닭을 적는다. 눌러도 아무 일 없는 버튼은
 * 고장으로 읽히고, iOS 처럼 사람이 할 수 있는 일이 있는 경우도 있다.
 */
function PushRow() {
  const { state, busy, enable, disable, test } = usePush();
  const [notice, setNotice] = useState<string | null>(null);

  // 서버에 VAPID 키가 없으면 이 기능 자체가 꺼진 것이다. 켤 수 없는 줄을 보여주지 않는다.
  if (state === "off") return null;

  if (state === "loading") {
    // 자리를 미리 잡아둔다. 없다가 생기면 아래 줄들이 눌린 뒤에 밀려 내려간다.
    return <div className={`${rowCls} h-[58px]`} aria-hidden="true" />;
  }

  if (state === "unsupported" || state === "install") {
    return (
      <div className={rowCls}>
        <div>
          <p className="text-sm text-muted">이 브라우저로 받기</p>
          <p className="mt-0.5 text-xs text-muted">
            {state === "install"
              ? "공유 → 홈 화면에 추가를 하면 켤 수 있어요"
              : "이 브라우저는 웹 알림을 지원하지 않아요"}
          </p>
        </div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={rowCls}>
        <div>
          <p className="text-sm text-muted">이 브라우저로 받기</p>
          {/* 한 번 거절하면 다시 물을 수 없다. 어디서 푸는지를 적어두는 수밖에 없다 */}
          <p className="mt-0.5 text-xs text-muted">
            알림이 차단돼 있어요. 주소창 자물쇠 → 알림에서 허용으로 바꿔주세요
          </p>
        </div>
      </div>
    );
  }

  const on = state === "on";

  const runTest = async () => {
    setNotice(null);
    try {
      await test();
      setNotice("보냈어요. 잠시 뒤 알림이 뜨지 않으면 기기의 방해금지를 확인해 주세요.");
    } catch (error) {
      setNotice(firstError(error, "시험 알림을 보내지 못했어요."));
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">이 브라우저로 받기</p>
          <p className="mt-0.5 text-xs text-muted">
            {on ? "이 기기에서 받는 중이에요" : "앱을 닫아둬도 알림이 와요"}
          </p>
        </div>
        <button
          onClick={async () => {
            setNotice(null);
            try {
              await (on ? disable() : enable());
            } catch (error) {
              // 조용히 삼키면 버튼만 제자리로 돌아온다 — 눌렀는데 아무 말이 없으면
              // 켜진 건지 만 건지 알 수 없다.
              setNotice(firstError(error, on ? "끄지 못했어요." : "켜지 못했어요."));
            }
          }}
          disabled={busy}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
            on
              ? "border-line text-muted hover:bg-paper"
              : "border-pine bg-pine text-white hover:bg-pine/90"
          }`}
        >
          {busy ? "…" : on ? "끄기" : "켜기"}
        </button>
      </div>

      {on && (
        <button onClick={runTest} className="mt-2 text-xs text-pine">
          시험 알림 보내기
        </button>
      )}
      {notice && <p className="mt-2 text-xs text-muted">{notice}</p>}
    </div>
  );
}
