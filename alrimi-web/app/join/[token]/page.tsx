"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { api, firstError } from "@/lib/api";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { Logo } from "@/components/Logo";
import type { InviteGreeting } from "@/types";

/**
 * 초대 링크가 열리는 자리. **로그인 없이** 열린다(`(main)` 묶음 밖이다).
 *
 * 여기서 하는 일은 하나다 — 쓸 비밀번호를 정하는 것. 정하는 순간 로그인까지 끝나므로
 * (서버가 토큰과 쿠키를 함께 준다) 받은 사람은 비밀번호 한 번 적고 바로 달력을 본다.
 * 예전처럼 임시 비밀번호를 옮겨 적고, 로그인하고, 들어와서 또 바꾸는 세 걸음이 없다.
 *
 * 칸이 하나뿐인 것도 같은 까닭이다. 확인 칸을 두면 두 번 치게 되는데, 잘못 쳐서 못
 * 들어가더라도 새 링크를 받으면 그만이다. 대신 "보기" 로 친 것을 눈으로 확인하게 한다.
 */
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);

  /** 누구를 맞이하는지. `undefined` 는 아직 물어보는 중, `null` 은 열리지 않는 링크 */
  const [greeting, setGreeting] = useState<InviteGreeting | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<InviteGreeting>(apiUrl.invite(token), { skipAuth: true })
      .then((data) => alive && setGreeting(data))
      .catch(() => alive && setGreeting(null));
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async () => {
    if (!password) {
      setError("쓸 비밀번호를 적어주세요");
      return;
    }
    setSaving(true);
    try {
      const data = await api.post<{ access_token: string }>(
        apiUrl.invite(token),
        { password },
        { skipAuth: true },
      );
      // 곧바로 로그인된 상태다. 로그인 화면을 한 번 더 지나가지 않는다.
      setToken(data.access_token);
      router.replace(pageUrl.home);
    } catch (err) {
      // 너무 쉬운 비밀번호 등 — 서버가 무엇이 문제인지 말해준다
      setError(firstError(err, "저장하지 못했어요. 잠시 뒤에 다시 해주세요"));
      setSaving(false);
    }
  };

  return (
    /* 로그인 화면과 같은 바탕·같은 위치다. 이 링크로 처음 만나는 앱이라 첫인상이 이어진다 */
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
          {greeting === undefined && <Waiting />}
          {greeting === null && <Expired />}
          {greeting && (
            <>
              <p className="text-lg font-semibold tracking-tight">
                안녕하세요, {greeting.name || greeting.username}님
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                쓸 비밀번호를 정해주세요. 다음부터는 아이디{" "}
                <b className="text-ink">{greeting.username}</b> 와 이 비밀번호로 들어와요.
              </p>

              <div className="relative mt-4">
                <input
                  autoFocus
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && !saving && submit()}
                  placeholder="새 비밀번호"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-line bg-paper py-3 pl-3.5 pr-12
                             text-base placeholder:text-muted/50 focus:border-pine focus:bg-card
                             focus:outline-none"
                />
                {/*
                  가린 칸에 한 번만 치게 하므로 눈으로 확인할 길이 있어야 한다.
                  확인 칸을 하나 더 두는 것보다 적게 치고 확실하다.
                */}
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "비밀번호 가리기" : "비밀번호 보기"}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted"
                >
                  {show ? (
                    <LuEyeOff className="h-4.5 w-4.5" aria-hidden="true" />
                  ) : (
                    <LuEye className="h-4.5 w-4.5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {error && <p className="mt-2 px-1 text-sm text-red-600">{error}</p>}

              <button
                onClick={submit}
                disabled={saving}
                className="mt-3 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white
                           disabled:opacity-60"
              >
                {saving ? "시작하는 중" : "시작하기"}
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          <Link href={pageUrl.intro} className="underline underline-offset-4">
            일정 알리미가 무엇인가요?
          </Link>
        </p>
      </div>
    </main>
  );
}

/** 물어보는 동안. 빈 카드는 고장과 구분되지 않아서 같은 크기의 자리를 잡아둔다 */
function Waiting() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="h-5 w-40 rounded bg-line" />
      <div className="h-4 w-full rounded bg-line/70" />
      <div className="h-12 w-full rounded-xl bg-line/50" />
    </div>
  );
}

/** 만료됐거나 이미 쓴 링크. 여기서 사람이 할 수 있는 일은 "새 링크를 부탁하기" 뿐이다 */
function Expired() {
  return (
    <>
      <p className="text-lg font-semibold tracking-tight">링크가 만료됐어요</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        이미 사용했거나 기한이 지난 링크예요. 초대해 주신 분께 새 링크를 부탁해주세요.
      </p>
      <Link
        href={pageUrl.login}
        className="mt-4 block w-full rounded-xl border border-line py-3 text-center text-sm"
      >
        로그인 화면으로
      </Link>
    </>
  );
}
