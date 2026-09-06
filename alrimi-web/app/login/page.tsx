"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { Logo } from "@/components/Logo";

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
    "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base " +
    "placeholder:text-muted/50 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/40";

  return (
    <main className="mx-auto flex min-h-dvh w-full flex-col justify-center px-7">
      <div className="mb-9">
        <Logo className="mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight">일정 알리미</h1>
        <p className="mt-1.5 text-sm text-muted">적어두면 때맞춰 알려드려요</p>
      </div>

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
                   hover:bg-pine/90 disabled:opacity-60"
      >
        {loading ? "로그인 중" : "로그인"}
      </button>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted">
        계정은 관리자가 발급합니다.
        <br />
        회원가입 기능은 없습니다.
      </p>
    </main>
  );
}
