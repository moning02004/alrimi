"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { apiUrl, pageUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";
import { Logo } from "./Logo";
import { PasswordForm } from "./AccountSheets";

/**
 * 처음 받은 비밀번호(0000)로 들어온 사람에게 앱 대신 보여주는 화면.
 *
 * **닫는 길이 없다.** 시트로 띄우면 밖을 눌러 닫고 그대로 앱을 쓰려 들 수 있는데,
 * 서버는 비밀번호를 바꾸기 전까지 거의 모든 요청을 막으므로(`accounts.authentication`)
 * 닫은 뒤의 화면은 전부 빈 채로 오류만 난다. 할 수 있는 일을 둘로 좁힌다: 바꾸거나,
 * 로그아웃하거나.
 *
 * **바꾸면 그 자리에서 앱으로 넘어간다.** 서버가 새 토큰을 주고 `useChangePassword` 가
 * 내 정보의 표시를 내리면, 이 화면을 고른 레이아웃(`app/(main)/layout.tsx`)이 알아서
 * 앱을 그린다. 새 비밀번호로 다시 로그인시키지 않는다.
 */
export function PasswordChangeRequired() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  const logout = async () => {
    await api.delete(apiUrl.revokeToken).catch(() => undefined);
    clear();
    router.replace(pageUrl.login);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-7">
      <div className="mb-7">
        <Logo className="mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight">비밀번호를 바꿔주세요</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          처음 받은 비밀번호(0000)는 누구나 아는 값이라 그대로 쓸 수 없어요. 새 비밀번호로
          바꾸면 바로 시작할 수 있어요.
        </p>
      </div>

      <PasswordForm currentPlaceholder="처음 받은 비밀번호 (0000)" />

      <button onClick={logout} className="mt-2 text-sm text-muted">
        로그아웃
      </button>
    </main>
  );
}
