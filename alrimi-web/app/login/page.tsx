"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { Logo } from "@/components/Logo";

/**
 * 로그인만 하는 화면.
 *
 * 소개는 `/`(`app/page.tsx`)가 맡는다 — 매일 오는 사람에게 이 화면은 문일 뿐이라, 설명이
 * 붙어 있으면 로그인할 때마다 그것을 지나가게 된다. 처음 온 사람은 아래 링크로 소개에 간다.
 *
 * **이미 들어와 있는 사람에게는 문을 열어둔 채 두지 않는다.** 앱 안쪽과 똑같이 refresh
 * 쿠키로 자동 로그인을 한 번 해보고(`useAuthBootstrap`), 살아 있으면 곧장 홈으로 보낸다.
 * 예전에는 메모리의 access 토큰만 봐서, 새로고침하거나 주소를 직접 쳐서 들어오면 멀쩡히
 * 로그인된 사람에게도 빈 로그인 폼이 나왔다 — 주소만 `/home` 으로 바꾸면 그대로 들어가지는,
 * 화면과 실제가 어긋난 자리였다.
 */
export default function LoginPage() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  /*
    앱 안쪽(`app/(main)/layout.tsx`)과 같은 것을 쓴다. 여기서 따로 재발급을 부르면 같은
    쿠키로 두 번 나가는데, 서버가 재발급마다 쿠키를 회전시켜 뒤의 것이 거절당한다.
    이 훅은 `pathname` 이 로그인일 때 로그인으로 보내지 않으므로 여기서도 그대로 쓴다.
  */
  const { ready, authenticated } = useAuthBootstrap();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authenticated) router.replace(pageUrl.home);
  }, [authenticated, router]);

  const submit = async () => {
    if (!username.trim() || !password) {
      toast.error("아이디와 비밀번호를 입력해주세요");
      return;
    }
    setLoading(true);
    try {
      const data = await api.post<{ access_token: string }>(
        apiUrl.obtainToken,
        { username: username.trim(), password },
        { skipAuth: true },
      );
      setToken(data.access_token);
      router.replace(pageUrl.home);
    } catch {
      toast.error("아이디 또는 비밀번호가 맞지 않아요");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-base " +
    "placeholder:text-muted/50 focus:border-pine focus:bg-card focus:outline-none";

  return (
    /*
      가운데보다 조금 위다. 맨 위에 붙이면 아래가 통째로 비어 보이고, 정가운데면 눈이 처음
      닿는 자리보다 낮아 한 번 내려다보게 된다. 위에서 15% 쯤 띄우면 카드가 화면 위쪽 3분의 2
      안에 앉는다.

      `justify-center` 가 아니라 위 여백으로 잡는 것은 키보드가 올라올 때를 위해서다 — 줄어드는
      것이 아래가 아니라 위 여백이어야 카드가 가려지지 않는다.
    */
    <main className="min-h-dvh bg-gradient-to-b from-pinelt to-paper px-5 pb-12 pt-[15vh]">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="text-xl font-semibold tracking-tight">일정 알리미</p>
            <p className="mt-0.5 text-sm text-muted">적어두면 때맞춰 알려드려요</p>
          </div>
        </div>

        {/*
          확인하는 동안에도 바탕과 로고는 그대로 둔다. 화면을 통째로 로딩으로 덮으면
          들어와 있던 사람에게는 색이 두 번 바뀌고(바탕 → 로딩 → 홈), 로그인해야 하는
          사람에게는 폼이 한 박자 늦게 튀어나온 것처럼 보인다. 갈아끼우는 것은 카드 속뿐이다.
        */}
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          {!ready || authenticated ? (
            <Checking />
          ) : (
          <>
          <div className="space-y-2.5">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디"
              autoComplete="username"
              className={inputCls}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="비밀번호"
              autoComplete="current-password"
              className={inputCls}
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="mt-3.5 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white
                       transition-colors hover:bg-pine/90 disabled:opacity-60"
          >
            {loading ? "로그인 중" : "로그인"}
          </button>

          <p className="mt-3 text-center text-xs text-muted">
            계정은 관리자가 발급합니다 · 회원가입은 없어요
          </p>
          </>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-4 text-xs text-muted">
          <Link href={pageUrl.intro} className="hover:text-pine">
            어떤 서비스인가요? →
          </Link>
        </div>
      </div>
    </main>
  );
}

/** 쿠키로 들어갈 수 있는지 물어보는 동안. 폼과 높이를 맞춰 카드가 덜컥이지 않게 한다 */
function Checking() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-8">
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-pine"
      />
      <p className="text-sm text-muted">들어가는 중</p>
    </div>
  );
}
