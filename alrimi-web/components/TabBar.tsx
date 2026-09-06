"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pageUrl } from "@/constants/routeUrl";
import { useAddSheet } from "@/store/ui";

/**
 * 등록 버튼을 탭바 가운데에 둔다.
 * 플로팅 버튼은 목록 마지막 항목을 가려서 쓰지 않는다.
 */
export function TabBar() {
  const pathname = usePathname();
  const openAdd = useAddSheet((s) => s.openAdd);

  const cls = (active: boolean) =>
    `text-sm ${active ? "font-medium text-pine" : "text-muted"}`;

  return (
    <nav className="safe-bottom mt-auto sticky bottom-0 h-[8vh] z-30 flex items-center border-t border-line bg-card px-2">
      <Link href={pageUrl.home} className="flex-1 py-1 text-center">
        <span className={cls(pathname.startsWith(pageUrl.home))}>홈</span>
      </Link>

      <div className="flex-1 text-center">
        <button
          onClick={() => openAdd()}
          aria-label="일정 등록"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full
                     bg-pine text-2xl font-light leading-none text-white active:bg-pine/90"
        >
          +
        </button>
      </div>

      <Link href={pageUrl.settings} className="flex-1 py-1 text-center">
        <span className={cls(pathname.startsWith(pageUrl.settings))}>설정</span>
      </Link>
    </nav>
  );
}
