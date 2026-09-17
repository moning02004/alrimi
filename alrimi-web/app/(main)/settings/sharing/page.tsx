"use client";

import { ReceivedSharing, SharingPeople } from "@/components/SharingPeople";
import { SubPageHeader } from "@/components/SubPageHeader";

const headCls = "px-1 pb-2 pt-5 text-xs font-medium text-muted";

/**
 * 함께 보기 — 내 공간을 보여주는 사람과, 나에게 보여주는 사람.
 *
 * 설정 한 화면에 두 목록과 찾기 칸까지 펼쳐두니 설정이 사람 목록으로 차 보였다. 한 번 정하면
 * 거의 안 바꾸는 것이라 안쪽 화면으로 뺐다. 어느 공간을 보여줄지는 공간마다 "함께 보기" 로
 * 켜고 끈다(공간 수정).
 */
export default function SharingPage() {
  return (
    <>
      <SubPageHeader title="함께 보기" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
        <p className={headCls}>함께 보는 사람</p>
        <p className="-mt-1 px-1 pb-2 text-xs leading-relaxed text-muted">
          함께 보기를 켠 공간을 보고 알림도 받아요. 공간마다 &lsquo;함께 보는 사람도 일정
          추가·수정&rsquo;을 켜면 그 공간의 일정을 함께 만들고 고칠 수 있어요.
        </p>
        <SharingPeople />

        {/* 받은 것이 있을 때만 선다 — 그만 보는 자리다 */}
        <ReceivedSharing heading={<p className={headCls}>나에게 보여주는 사람</p>} />
      </main>
    </>
  );
}
