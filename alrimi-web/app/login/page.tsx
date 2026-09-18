"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { Logo } from "@/components/Logo";

/**
 * 로그인만 하는 화면.
 *
 * 소개는 `/`(`app/page.tsx`)가 맡는다 — 매일 오는 사람에게 이 화면은 문일 뿐이라, 설명이
 * 붙어 있으면 로그인할 때마다 그것을 지나가게 된다. 처음 온 사람은 아래 링크로 소개에 간다.
 */
export default function LoginPage() {
  const router = useRouter();
  const { token, setToken } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) router.replace(pageUrl.home);
  }, [token, router]);

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

        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
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
