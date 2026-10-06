"use client";

import { SeriesList } from "@/components/SeriesList";
import { SubPageHeader } from "@/components/SubPageHeader";

/**
 * 반복 일정 — 끝나지 않은 반복들. 내 정보 안쪽 화면이다.
 *
 * 내 정보에 펼쳐두지 않는 것은 반복이 늘수록 목록이 길어져 아래 섹션을 밀어내서다(함께 보기·
 * 사용자 관리와 같은 까닭). 공간 필터는 두지 않는다 — 무엇이 돌고 있는지 전부 보는 자리다.
 */
export default function RepeatsPage() {
  return (
    <>
      <SubPageHeader title="반복 일정" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
        <SeriesList zoneId={null} />
      </main>
    </>
  );
}
