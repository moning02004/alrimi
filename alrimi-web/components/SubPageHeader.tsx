"use client";

import Link from "next/link";
import { pageUrl } from "@/constants/routeUrl";

/**
 * 설정 안쪽 화면의 머리글. 왼쪽에 설정으로 돌아가는 길, 가운데에 이 화면 이름.
 *
 * 브라우저 뒤로가기에 맡기지 않고 늘 설정으로 가는 링크다 — 주소를 직접 열고 들어온
 * 사람에게는 "뒤" 가 설정이 아니다.
 */
export function SubPageHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center">
        <Link href={pageUrl.settings} className="justify-self-start text-sm text-muted hover:text-ink">
          ← 설정
        </Link>
        <h1 className="text-base font-semibold">{title}</h1>
        <span aria-hidden="true" />
      </div>
    </header>
  );
}
