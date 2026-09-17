"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";

/** 두 번째 뒤로가기를 기다리는 시간. 이 안에 한 번 더 누르면 앱이 닫힌다 */
const EXIT_WINDOW_MS = 2000;

/** 방문 기록에 끼워둔 한 칸임을 알아보는 표시 */
const GUARD_KEY = "alrimiBackGuard";

/** 홈 화면에 설치한 앱으로 열었나. 브라우저 탭에서는 뒤로가기를 가로채지 않는다 */
function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushGuard() {
  // Next.js 가 pushState 를 감싸 자기 상태(__NA 등)를 이어 붙인다 — 이 칸으로 돌아와도 새로 불러오지 않는다
  window.history.pushState({ ...window.history.state, [GUARD_KEY]: true }, "");
}

/**
 * 설치한 앱의 홈에서 뒤로가기를 **두 번** 눌러야 닫힌다.
 *
 * 안드로이드는 첫 화면에서 뒤로가기를 누르면 앱을 바로 닫는다. 목록을 훑다가 습관처럼 누르면
 * 앱이 사라져서, 다시 열고 로그인 확인을 기다려야 한다.
 *
 * 홈에 들어오면 방문 기록에 한 칸을 끼워둔다. 첫 뒤로가기는 그 칸을 빼면서 "한 번 더 누르면
 * 종료돼요" 를 띄운다. 2초 안에 또 누르면 더 돌아갈 칸이 없어 시스템이 앱을 닫고, 2초가
 * 지나면 칸을 다시 끼워 처음으로 돌아간다. 웹에서 앱을 직접 닫을 방법은 없어서 이 방식이다.
 *
 * 상세 화면 등으로 갔다 돌아올 때는 끼워둔 칸으로 돌아오는 것이라 다시 끼우지 않는다. 다른
 * 화면을 거쳐 홈에 왔으면 뒤로가기는 그 화면으로 돌아가는 원래 동작 그대로다.
 * iOS 는 설치한 앱에 뒤로가기 버튼이 없어 해당이 없다.
 */
export function useDoubleBackToExit() {
  useEffect(() => {
    if (!standalone()) return;

    /*
      앱을 열고 **처음 본 화면이 홈일 때만** 칸을 끼운다(기록이 한 칸뿐). 설정에서 탭으로 홈에
      왔으면 뒤로가기는 설정으로 돌아가는 길이지 종료가 아니다. 끼워둔 칸으로 돌아온 것이면
      이미 있으니 또 끼우지 않는다.
    */
    const onGuard = Boolean(window.history.state?.[GUARD_KEY]);
    const first = window.history.length <= 1;
    // 칸이 없고 처음 화면도 아니면 가로챌 것이 없다 — 뒤로가기를 그대로 둔다
    if (!onGuard && !first) return;
    if (!onGuard) pushGuard();

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onPopState = (event: PopStateEvent) => {
      // 끼워둔 칸으로 **돌아온** 것(앞으로가기, 상세에서 뒤로)은 가로챌 일이 아니다
      if (event.state?.[GUARD_KEY]) return;
      // 이미 한 번 눌러 기다리는 중이면 이 뒤로가기로 앱이 닫힌다 — 아무것도 하지 않는다
      if (timer) return;

      toast("뒤로 버튼을 한 번 더 누르면 종료돼요", { id: "back-to-exit", duration: EXIT_WINDOW_MS });
      timer = setTimeout(() => {
        timer = null;
        // 기다리는 사이 다른 화면으로 가지 않았으면 칸을 다시 끼운다
        /*
      앱을 열고 **처음 본 화면이 홈일 때만** 칸을 끼운다(기록이 한 칸뿐). 설정에서 탭으로 홈에
      왔으면 뒤로가기는 설정으로 돌아가는 길이지 종료가 아니다. 끼워둔 칸으로 돌아온 것이면
      이미 있으니 또 끼우지 않는다.
    */
    const onGuard = Boolean(window.history.state?.[GUARD_KEY]);
    const first = window.history.length <= 1;
    // 칸이 없고 처음 화면도 아니면 가로챌 것이 없다 — 뒤로가기를 그대로 둔다
    if (!onGuard && !first) return;
    if (!onGuard) pushGuard();
      }, EXIT_WINDOW_MS);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
