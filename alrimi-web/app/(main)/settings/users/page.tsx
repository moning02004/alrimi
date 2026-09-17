"use client";

import { useMe } from "@/hooks/useMe";
import { UserAdminGroup } from "@/components/UserSheets";
import { SubPageHeader } from "@/components/SubPageHeader";

/**
 * 사용자 관리. 설정 안쪽 화면이다(관리자·최고 관리자).
 *
 * 설정에 펼쳐두지 않는 것은 사람이 늘수록 목록이 길어져 아래 섹션을 밀어내고, 매일 여는
 * 자리도 아니라서다. 창이 아니라 화면인 것은 주소가 생겨 뒤로가기로 설정에 돌아갈 수 있어서다.
 *
 * 권한이 없는 사람이 주소로 들어오면 목록 대신 안내만 둔다 — 서버도 목록을 주지 않는다.
 */
export default function UsersPage() {
  const { data: me, isPending } = useMe();
  const allowed = Boolean(me && (me.is_staff || me.is_superuser));

  return (
    <>
      <SubPageHeader title="사용자 관리" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
        {!isPending && !allowed ? (
          <p className="py-10 text-center text-sm text-muted">관리자만 볼 수 있어요</p>
        ) : (
          <UserAdminGroup me={me} heading={false} />
        )}
      </main>
    </>
  );
}
