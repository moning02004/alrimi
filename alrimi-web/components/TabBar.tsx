"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import {
  HiCog6Tooth,
  HiHome,
  HiOutlineCog6Tooth,
  HiOutlineHome,
  HiPlus,
} from "react-icons/hi2";
import { pageUrl } from "@/constants/routeUrl";
import { useAddSheet } from "@/store/ui";

/**
 * 등록 버튼을 탭바 가운데에 둔다.
 * 플로팅 버튼은 목록 마지막 항목을 가려서 쓰지 않는다.
 */
export function TabBar() {
  const pathname = usePathname();
  const openAdd = useAddSheet((s) => s.openAdd);

  return (
    <nav className="safe-bottom mt-auto bottom-0 h-[9vh] z-30 flex items-center border-t border-line bg-card px-2">
      <Tab
        href={pageUrl.home}
        label="홈"
        active={pathname.startsWith(pageUrl.home)}
        On={HiHome}
        Off={HiOutlineHome}
      />

      <div className="flex-1 text-center">
        <button
          onClick={() => openAdd()}
          aria-label="일정 등록"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full
                     bg-pine text-white active:bg-pine/90"
        >
          <HiPlus className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <Tab
        href={pageUrl.settings}
        label="설정"
        active={pathname.startsWith(pageUrl.settings)}
        On={HiCog6Tooth}
        Off={HiOutlineCog6Tooth}
      />
    </nav>
  );
}

/**
 * 글씨 대신 아이콘 하나만 둔다. 이름은 `aria-label` 로만 남기므로 눈으로는
 * 읽히지 않는다 — 지금 어디인지는 색과 채움이 말한다. 색만으로 나누면 색약에서
 * 두 칸이 같아 보이므로, 선 그림(Off)과 꽉 찬 그림(On)으로 모양까지 다르게 둔다.
 */
function Tab({
  href,
  label,
  active,
  On,
  Off,
}: {
  href: string;
  label: string;
  active: boolean;
  On: IconType;
  Off: IconType;
}) {
  const Icon = active ? On : Off;

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="flex flex-1 items-center justify-center py-1"
    >
      <Icon className={`h-6 w-6 ${active ? "text-pine" : "text-muted"}`} aria-hidden="true" />
    </Link>
  );
}
